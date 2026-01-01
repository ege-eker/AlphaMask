FROM python:3.11-slim

WORKDIR /processor

RUN apt-get update && apt-get install -y \
    ffmpeg libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /shared/tmp
COPY . .

CMD ["python", "worker.py"]