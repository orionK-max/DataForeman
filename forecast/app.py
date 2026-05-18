"""
DataForeman Forecast Service
Wraps Google TimesFM 2.5 (200M, PyTorch) as a lightweight FastAPI endpoint.
The model is loaded once at startup and cached for all subsequent requests.
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("forecast")

_model = None
_model_ready = False


def _load_model():
    global _model, _model_ready
    try:
        import torch
        import timesfm

        logger.info("Loading TimesFM 2.5 model from HuggingFace (may download ~925MB on first run)...")
        torch.set_float32_matmul_precision("high")

        _model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(
            "google/timesfm-2.5-200m-pytorch"
        )
        _model.compile(
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
        _model_ready = True
        logger.info("TimesFM model ready")
    except Exception as e:
        logger.error(f"Failed to load TimesFM model: {e}", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_model()
    yield
    logger.info("Forecast service shutting down")


app = FastAPI(title="DataForeman Forecast Service", lifespan=lifespan)


# ── Request / Response models ──────────────────────────────────────────────────

class ForecastRequest(BaseModel):
    values: list[float]
    horizon: int = 24
    quantiles: bool = False  # False = simple mode (point only), True = research mode (+ bands)


class ForecastResponse(BaseModel):
    point_forecast: list[float]
    lower_band: Optional[list[float]] = None  # 10th percentile — research mode only
    upper_band: Optional[list[float]] = None  # 90th percentile — research mode only


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "model_ready": _model_ready}


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    if not _model_ready:
        raise HTTPException(status_code=503, detail="model_loading")

    if len(req.values) < 4:
        raise HTTPException(status_code=400, detail="need at least 4 data points")

    # Cap horizon to model maximum
    horizon = max(1, min(req.horizon, 256))

    values = np.array(req.values, dtype=np.float32)

    point_forecast, quantile_forecast = _model.forecast(
        horizon=horizon,
        inputs=[values],
    )

    result = ForecastResponse(
        point_forecast=point_forecast[0].tolist()
    )

    if req.quantiles:
        # quantile_forecast shape: (batch, horizon, 10) → indices 0=10th, 9=90th percentile
        result.lower_band = quantile_forecast[0, :, 0].tolist()
        result.upper_band = quantile_forecast[0, :, 9].tolist()

    return result
