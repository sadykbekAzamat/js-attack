const https = require("https");
const http = require("http");

const config = {
  baseUrl: "https://api.aliya.kz-beta.pp.ua",
  endpoint: "/auth/",
  requestsPerSecond: 1000,
  duration: 60,
  method: "GET",
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "LoadTest/1.0",
  },
  body: null,
};

const stats = {
  total: 0,
  success: 0,
  failed: 0,
  responseTimes: [],
  errors: {},
};

function makeRequest() {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(config.endpoint, config.baseUrl);
    const protocol = url.protocol === "https:" ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: config.method,
      headers: config.headers,
      rejectUnauthorized: false,
    };

    const req = protocol.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        const responseTime = Date.now() - startTime;
        stats.total++;
        stats.responseTimes.push(responseTime);

        if (res.statusCode >= 200 && res.statusCode < 300) {
          stats.success++;
        } else {
          stats.failed++;
          const errorKey = `Status ${res.statusCode}`;
          stats.errors[errorKey] = (stats.errors[errorKey] || 0) + 1;

          if (res.statusCode === 429) {
            rateLimitHit = true;
            isRunning = false;
          }
        }

        resolve({ success: res.statusCode < 400, responseTime });
      });
    });

    req.on("error", (error) => {
      const responseTime = Date.now() - startTime;
      stats.total++;
      stats.failed++;
      stats.responseTimes.push(responseTime);

      const errorKey = error.code || error.message;
      stats.errors[errorKey] = (stats.errors[errorKey] || 0) + 1;

      resolve({ success: false, responseTime, error: errorKey });
    });

    req.on("timeout", () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      stats.total++;
      stats.failed++;
      stats.responseTimes.push(responseTime);
      stats.errors["TIMEOUT"] = (stats.errors["TIMEOUT"] || 0) + 1;
      resolve({ success: false, responseTime, error: "TIMEOUT" });
    });

    req.setTimeout(10000);

    if (config.body) {
      req.write(config.body);
    }

    req.end();
  });
}

function calculateStats() {
  const times = stats.responseTimes;
  if (times.length === 0)
    return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };

  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  return { avg, min, max, p50, p95, p99 };
}

function displayStats() {
  const { avg, min, max, p50, p95, p99 } = calculateStats();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rps = (stats.total / (elapsed || 1)).toFixed(2);

  console.clear();
  console.log("═══════════════════════════════════════════════════");
  console.log("  НАГРУЗОЧНОЕ ТЕСТИРОВАНИЕ");
  console.log("═══════════════════════════════════════════════════");
  console.log(`URL:           ${config.baseUrl}${config.endpoint}`);
  console.log(`Метод:         ${config.method}`);
  console.log(`Цель:          ${config.requestsPerSecond} req/s`);
  console.log(
    `Длительность:  ${config.duration > 0 ? config.duration + "s" : "∞"}`,
  );
  console.log("───────────────────────────────────────────────────");
  console.log(`Время работы:  ${elapsed}s`);
  console.log(`Всего запросов: ${stats.total}`);
  console.log(
    `Успешных:      ${stats.success} (${((stats.success / stats.total) * 100 || 0).toFixed(1)}%)`,
  );
  console.log(
    `Ошибок:        ${stats.failed} (${((stats.failed / stats.total) * 100 || 0).toFixed(1)}%)`,
  );
  console.log(`Фактически:    ${rps} req/s`);
  console.log("───────────────────────────────────────────────────");
  console.log("Время ответа (мс):");
  console.log(`  Среднее:     ${avg.toFixed(2)}`);
  console.log(`  Минимум:     ${min}`);
  console.log(`  Максимум:    ${max}`);
  console.log(`  Медиана:     ${p50}`);
  console.log(`  95%:         ${p95}`);
  console.log(`  99%:         ${p99}`);

  if (Object.keys(stats.errors).length > 0) {
    console.log("───────────────────────────────────────────────────");
    console.log("Ошибки:");
    Object.entries(stats.errors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([error, count]) => {
        console.log(`  ${error}: ${count}`);
      });
  }
  console.log("═══════════════════════════════════════════════════");
  console.log("Нажмите Ctrl+C для остановки");
}

// Основной цикл
let startTime;
let requestCount = 0;
let isRunning = true;
let rateLimitHit = false;

async function runLoadTest() {
  startTime = Date.now();
  const intervalMs = 1000 / config.requestsPerSecond;

  console.log("Запуск нагрузочного теста...\n");

  const statsInterval = setInterval(displayStats, 1000);

  let endTimeout;
  if (config.duration > 0) {
    endTimeout = setTimeout(() => {
      isRunning = false;
      clearInterval(statsInterval);
      displayStats();
      if (rateLimitHit) {
        console.log(
          "\n⚠️  Тест остановлен: получен статус 429 (Too Many Requests)",
        );
      } else {
        console.log("\nТест завершён!");
      }
      process.exit(0);
    }, config.duration * 1000);
  }

  while (isRunning) {
    const requestStartTime = Date.now();

    makeRequest().catch((err) => {
      console.error("Критическая ошибка:", err);
    });

    requestCount++;

    if (rateLimitHit) {
      clearInterval(statsInterval);
      if (endTimeout) clearTimeout(endTimeout);
      displayStats();
      console.log(
        "\n⚠️  Тест остановлен: получен статус 429 (Too Many Requests)",
      );
      console.log("Сервер запросил снижение нагрузки.\n");
      process.exit(0);
    }

    const elapsed = Date.now() - requestStartTime;
    const waitTime = Math.max(0, intervalMs - elapsed);

    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  process.on("SIGINT", () => {
    isRunning = false;
    clearInterval(statsInterval);
    if (endTimeout) clearTimeout(endTimeout);
    displayStats();
    console.log("\n\nТест прерван пользователем!");
    process.exit(0);
  });
}

console.log("Инициализация нагрузочного теста...");
runLoadTest();
