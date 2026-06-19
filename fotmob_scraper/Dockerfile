FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1

# 의존성 + Playwright Chromium(+OS 라이브러리) 설치.
# requirements로 설치된 playwright 버전에 맞는 브라우저가 함께 깔린다.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium

COPY . .
EXPOSE 8800
# Render 등 클라우드는 $PORT를 지정해 주고 그 포트에 바인딩해야 라우팅된다.
# shell 형식이라 ${PORT} 치환이 되며, 로컬(도커 compose 등 PORT 미지정)은 8800으로 폴백.
CMD python -m uvicorn api:app --host 0.0.0.0 --port ${PORT:-8800}
