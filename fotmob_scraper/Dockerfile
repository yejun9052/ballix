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
CMD ["python", "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8800"]
