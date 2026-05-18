FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# Install timesfm 2.5 from GitHub (not yet on PyPI), plus FastAPI stack
# torch is included via [torch] extra — CPU build is sufficient
RUN pip install --no-cache-dir \
    "timesfm[torch] @ git+https://github.com/google-research/timesfm.git" \
    fastapi \
    "uvicorn[standard]"

COPY app.py .

# HuggingFace model cache — volume-mounted so model persists across restarts
ENV HF_HOME=/root/.cache/huggingface

EXPOSE 8100

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8100"]
