# ── 빌드 스테이지: gradle 래퍼로 실행 가능한 bootJar 생성 ──
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY . .
# gradlew가 Windows(CRLF)로 커밋됐을 수 있어 LF로 정규화 후 실행
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew \
    && ./gradlew --no-daemon clean bootJar -x test

# ── 런타임 스테이지: JRE만 ──
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
