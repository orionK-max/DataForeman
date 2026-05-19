"""
DataForeman Forecast Service

Supports multiple AI time-series forecasting models:
  - TimesFM 2.5  (Google, 200M, PyTorch)           — key: "timesfm-2.5-200m"
  - Chronos-Bolt (Amazon, tiny/small/base/large)    — keys: "chronos-bolt-*"
  - Chronos T5   (Amazon, small/base/large)         — keys: "chronos-t5-*"

TimesFM is preloaded at startup (default model).
Chronos models are loaded lazily on first request and cached for subsequent calls.
Each model is guarded by a per-key threading.Lock so concurrent requests don't
double-load the same model.
"""

import logging
import threading
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("forecast")

# ── Model registry ─────────────────────────────────────────────────────────────
# key → { type, hf_id, description }
# Keep in sync with FORECAST_MODELS in ForecastConfigTab.js
MODEL_REGISTRY: dict = {
    "timesfm-2.5-200m": {
        "type": "timesfm",
        "hf_id": "google/timesfm-2.5-200m-pytorch",
        "description": "Google TimesFM 2.5 · 200M",
    },
    # Chronos-2: latest Amazon model (Oct 2025) — multivariate + covariate support
    "chronos-2": {
        "type": "chronos2",
        "hf_id": "amazon/chronos-2",
        "description": "Amazon Chronos-2 · 120M · multivariate",
    },
    "chronos-2-small": {
        "type": "chronos2",
        "hf_id": "autogluon/chronos-2-small",
        "description": "Amazon Chronos-2 · small · 28M",
    },
    # Chronos-Bolt: fast patch-based quantile models
    "chronos-bolt-tiny": {
        "type": "chronos",
        "hf_id": "amazon/chronos-bolt-tiny",
        "description": "Amazon Chronos-Bolt · tiny · 9M",
    },
    "chronos-bolt-mini": {
        "type": "chronos",
        "hf_id": "amazon/chronos-bolt-mini",
        "description": "Amazon Chronos-Bolt · mini · 21M",
    },
    "chronos-bolt-small": {
        "type": "chronos",
        "hf_id": "amazon/chronos-bolt-small",
        "description": "Amazon Chronos-Bolt · small · 48M",
    },
    "chronos-bolt-base": {
        "type": "chronos",
        "hf_id": "amazon/chronos-bolt-base",
        "description": "Amazon Chronos-Bolt · base · 205M",
    },
}

DEFAULT_MODEL = "timesfm-2.5-200m"

# ── Per-model state ────────────────────────────────────────────────────────────
_models: dict = {}         # key → model/pipeline instance
_model_ready: dict = {}    # key → bool
_model_locks: dict = {k: threading.Lock() for k in MODEL_REGISTRY}


# ── Loaders ────────────────────────────────────────────────────────────────────

def _load_timesfm(key: str, hf_id: str) -> bool:
    try:
        import torch
        import timesfm

        logger.info(f"Loading TimesFM model {hf_id} (may download ~925 MB on first run)...")
        torch.set_float32_matmul_precision("high")
        model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(hf_id)
        model.compile(
            timesfm.ForecastConfig(
                max_context=1024,
                max_horizon=256,
                normalize_inputs=True,
                use_continuous_quantile_head=True,
                force_flip_invariance=True,
                infer_is_positive=True,
                fix_quantile_crossing=True,
            )
        )
        _models[key] = model
        _model_ready[key] = True
        logger.info(f"TimesFM model '{key}' ready")
        return True
    except Exception as e:
        logger.error(f"Failed to load TimesFM model '{key}': {e}", exc_info=True)
        _model_ready[key] = False
        return False


def _load_chronos(key: str, hf_id: str) -> bool:
    try:
        import torch
        from chronos import BaseChronosPipeline

        logger.info(f"Loading Chronos-Bolt model {hf_id}...")
        pipeline = BaseChronosPipeline.from_pretrained(
            hf_id,
            device_map="cpu",
            dtype=torch.float32,
        )
        _models[key] = pipeline
        _model_ready[key] = True
        logger.info(f"Chronos-Bolt model '{key}' ready")
        return True
    except Exception as e:
        logger.error(f"Failed to load Chronos-Bolt model '{key}': {e}", exc_info=True)
        _model_ready[key] = False
        return False


def _load_chronos2(key: str, hf_id: str) -> bool:
    try:
        import torch
        from chronos import Chronos2Pipeline

        logger.info(f"Loading Chronos-2 model {hf_id}...")
        pipeline = Chronos2Pipeline.from_pretrained(
            hf_id,
            device_map="cpu",
            dtype=torch.float32,
        )
        _models[key] = pipeline
        _model_ready[key] = True
        logger.info(f"Chronos-2 model '{key}' ready")
        return True
    except Exception as e:
        logger.error(f"Failed to load Chronos-2 model '{key}': {e}", exc_info=True)
        _model_ready[key] = False
        return False


def _ensure_loaded(key: str) -> bool:
    """Load a model if not already loaded. Thread-safe. Returns True when ready."""
    if _model_ready.get(key):
        return True
    if key not in MODEL_REGISTRY:
        return False
    with _model_locks[key]:
        if _model_ready.get(key):
            return True  # another thread loaded it while we waited
        spec = MODEL_REGISTRY[key]
        if spec["type"] == "timesfm":
            return _load_timesfm(key, spec["hf_id"])
        elif spec["type"] == "chronos":
            return _load_chronos(key, spec["hf_id"])
        elif spec["type"] == "chronos2":
            return _load_chronos2(key, spec["hf_id"])
    return False


# ── Startup ────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload default model (TimesFM) in a background thread so the service
    # starts immediately and serves 503 "model_loading" until ready.
    t = threading.Thread(target=_ensure_loaded, args=(DEFAULT_MODEL,), daemon=True)
    t.start()
    yield
    logger.info("Forecast service shutting down")


app = FastAPI(title="DataForeman Forecast Service", lifespan=lifespan)


# ── Request / Response models ──────────────────────────────────────────────────

class ForecastRequest(BaseModel):
    values: list[float]
    horizon: int = 24
    quantiles: bool = False        # False = point only, True = include lower/upper bands
    model: str = DEFAULT_MODEL     # key from MODEL_REGISTRY


class ForecastResponse(BaseModel):
    point_forecast: list[float]
    lower_band: Optional[list[float]] = None   # 10th percentile
    upper_band: Optional[list[float]] = None   # 90th percentile
    model: str = DEFAULT_MODEL


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "ok": True,
        "models": {k: {"ready": _model_ready.get(k, False)} for k in MODEL_REGISTRY},
    }


@app.get("/models")
def list_models():
    """Return all supported models with their ready state."""
    return {
        k: {**spec, "ready": _model_ready.get(k, False)}
        for k, spec in MODEL_REGISTRY.items()
    }


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    model_key = req.model if req.model in MODEL_REGISTRY else DEFAULT_MODEL

    if not _ensure_loaded(model_key):
        raise HTTPException(status_code=503, detail="model_loading")

    instance = _models.get(model_key)
    if instance is None:
        raise HTTPException(status_code=503, detail="model_loading")

    if len(req.values) < 4:
        raise HTTPException(status_code=400, detail="need at least 4 data points")

    horizon = max(1, min(req.horizon, 256))
    spec = MODEL_REGISTRY[model_key]

    if spec["type"] == "timesfm":
        return _run_timesfm(instance, req.values, horizon, req.quantiles, model_key)
    elif spec["type"] in ("chronos", "chronos2"):
        return _run_chronos(instance, req.values, horizon, req.quantiles, model_key)

    raise HTTPException(status_code=500, detail="unknown model type")


# ── Inference helpers ──────────────────────────────────────────────────────────

def _run_timesfm(model, values: list, horizon: int, quantiles: bool, model_key: str) -> ForecastResponse:
    values_np = np.array(values, dtype=np.float32)
    point_forecast, quantile_forecast = model.forecast(
        horizon=horizon,
        inputs=[values_np],
    )
    result = ForecastResponse(point_forecast=point_forecast[0].tolist(), model=model_key)
    if quantiles:
        # quantile_forecast shape: (batch, horizon, 10) — index 1=10th pct, 9=90th pct
        result.lower_band = quantile_forecast[0, :, 1].tolist()
        result.upper_band = quantile_forecast[0, :, 9].tolist()
    return result


def _run_chronos(pipeline, values: list, horizon: int, quantiles: bool, model_key: str) -> ForecastResponse:
    import torch
    context = [torch.tensor(values, dtype=torch.float32)]

    if hasattr(pipeline, "predict_quantiles"):
        # Chronos-Bolt:  quantile_preds is a tensor  (batch, horizon, n_quantiles)
        # Chronos-2:     quantile_preds is a list of tensors, each (n_variates, horizon, n_quantiles)
        quantile_preds, _ = pipeline.predict_quantiles(
            context,
            prediction_length=horizon,
            quantile_levels=[0.1, 0.5, 0.9],
            limit_prediction_length=False,
        )
        preds = quantile_preds[0]                   # (horizon, 3) or (n_variates, horizon, 3)
        if preds.dim() == 3:
            preds = preds[0]                        # squeeze n_variates dim → (horizon, 3)
        point = preds[:, 1].tolist()                # 0.5 median
        lower = preds[:, 0].tolist()                # 0.1
        upper = preds[:, 2].tolist()                # 0.9
    else:
        # Chronos-T5: sample-based — compute quantiles from samples
        samples = pipeline.predict(
            context,
            prediction_length=horizon,
            num_samples=20,
            limit_prediction_length=False,
        )  # (batch, num_samples, horizon)
        s = samples[0].float()                      # (num_samples, horizon)
        point = torch.quantile(s, 0.5, dim=0).tolist()
        lower = torch.quantile(s, 0.1, dim=0).tolist()
        upper = torch.quantile(s, 0.9, dim=0).tolist()

    result = ForecastResponse(point_forecast=point, model=model_key)
    if quantiles:
        result.lower_band = lower
        result.upper_band = upper
    return result


# ── Multivariate (Chronos-2 only) ──────────────────────────────────────────────

class MultivariateRequest(BaseModel):
    targets: dict[str, list[float]]                 # tag_id (str) → context values
    past_covariates: dict[str, list[float]] = {}    # name → context values (same len as target)
    future_covariates: dict[str, list[float]] = {}  # name → future values (len == horizon)
    horizon: int = 24
    quantiles: bool = False
    model: str = "chronos-2"


class MultivariateResponse(BaseModel):
    targets: dict[str, ForecastResponse]
    model: str


@app.post("/forecast/multivariate", response_model=MultivariateResponse)
def forecast_multivariate(req: MultivariateRequest):
    model_key = req.model if req.model in MODEL_REGISTRY else "chronos-2"
    spec = MODEL_REGISTRY.get(model_key, {})

    if spec.get("type") != "chronos2":
        raise HTTPException(status_code=400, detail="multivariate endpoint requires a chronos-2 model")

    if not _ensure_loaded(model_key):
        raise HTTPException(status_code=503, detail="model_loading")

    pipeline = _models.get(model_key)
    if pipeline is None:
        raise HTTPException(status_code=503, detail="model_loading")

    if not req.targets:
        raise HTTPException(status_code=400, detail="targets must not be empty")

    for k, v in req.targets.items():
        if len(v) < 4:
            raise HTTPException(status_code=400, detail=f"target '{k}' needs at least 4 data points")

    horizon = max(1, min(req.horizon, 256))
    return _run_chronos2_multivariate(
        pipeline, req.targets, req.past_covariates, req.future_covariates,
        horizon, req.quantiles, model_key,
    )


def _run_chronos2_multivariate(
    pipeline,
    targets: dict,
    past_covariates: dict,
    future_covariates: dict,
    horizon: int,
    quantiles: bool,
    model_key: str,
) -> MultivariateResponse:
    import torch

    target_keys = list(targets.keys())
    tasks = []
    for key in target_keys:
        task: dict = {"target": torch.tensor(targets[key], dtype=torch.float32)}
        if past_covariates:
            task["past_covariates"] = {
                k: torch.tensor(v, dtype=torch.float32)
                for k, v in past_covariates.items()
            }
        if future_covariates:
            task["future_covariates"] = {
                k: torch.tensor(v[:horizon], dtype=torch.float32)
                for k, v in future_covariates.items()
            }
        tasks.append(task)

    quantile_preds, _ = pipeline.predict_quantiles(
        tasks,
        prediction_length=horizon,
        quantile_levels=[0.1, 0.5, 0.9],
        limit_prediction_length=False,
    )

    results = {}
    for i, key in enumerate(target_keys):
        preds = quantile_preds[i]           # (n_variates, horizon, 3) or (horizon, 3)
        if preds.dim() == 3:
            preds = preds[0]                # squeeze n_variates → (horizon, 3)
        point = preds[:, 1].tolist()        # 0.5 median
        lower = preds[:, 0].tolist()        # 0.1
        upper = preds[:, 2].tolist()        # 0.9

        resp = ForecastResponse(point_forecast=point, model=model_key)
        if quantiles:
            resp.lower_band = lower
            resp.upper_band = upper
        results[key] = resp

    return MultivariateResponse(targets=results, model=model_key)
