import net from "node:net";

export interface DetectedService {
  port: number;
  url: string;
  name: string;
  isStream: boolean;
  defaultModel?: string;
}

const COMMON_SERVICES = [
  { port: 3000, name: "Next.js / Node Web App", isStream: false },
  { port: 11434, name: "Ollama Local LLM", isStream: true, defaultModel: "llama3", path: "/v1/chat/completions" },
  { port: 8000, name: "FastAPI / Python Server", isStream: false },
  { port: 8080, name: "Express / Spring Backend", isStream: false },
  { port: 5173, name: "Vite Dev Server", isStream: false },
  { port: 4000, name: "GraphQL / API Gateway", isStream: false },
];

function checkPort(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      isConnected = true;
      socket.destroy();
      resolve(true);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("error", () => {
      resolve(false);
    });

    socket.connect(port, "127.0.0.1");
  });
}

export async function detectActiveServices(): Promise<DetectedService[]> {
  const detected: DetectedService[] = [];

  for (const service of COMMON_SERVICES) {
    const isOpen = await checkPort(service.port);
    if (isOpen) {
      const fullUrl = service.path
        ? `http://localhost:${service.port}${service.path}`
        : `http://localhost:${service.port}`;

      detected.push({
        port: service.port,
        url: fullUrl,
        name: service.name,
        isStream: service.isStream,
        defaultModel: service.defaultModel,
      });
    }
  }

  return detected;
}
