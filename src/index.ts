import express, { NextFunction, Request, Response } from "express";
import { createClient } from "redis";

const redisClient = createClient();
const app = express();
const port = process.env.PORT || 3000;

const getAllProducts = () => {
  const time = Math.random() * 500;

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(["Product 1", "Product 33"]);
    }, time);
  });
};

const rateLimit =
  (resource: string, limit = 5) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const key = `rate-limit-${resource}-${ip}`;
    const requestCount = Number((await redisClient.get(key)) || 0) + 1;
    await redisClient.set(key, requestCount, { EX: 30 });
    if (requestCount > limit) {
      return res.send({ error: "rate-limit" });
    }
    next();
  };

app.use(rateLimit("app", 8));

app.get("/new-item-saved", async (req: Request, res: Response) => {
  await redisClient.del("getAllProducts");
  res.send({ ok: true });
});

app.get("/", rateLimit("home"), async (req: Request, res: Response) => {
  const allProductsFromCash = await redisClient.get("getAllProducts");
  const isProductsFromCashStale = !(await redisClient.get(
    "getAllProducts:validation"
  ));

  if (isProductsFromCashStale) {
    const isRefetching = !!(await redisClient.get(
      "getAllProducts:is-refetching"
    ));
    if (!isRefetching) {
      await redisClient.set("getAllProducts:is-refetching", "true", { EX: 20 });
      setTimeout(async () => {
        console.log("Cache is stale - refetching...");
        const allProducts = await getAllProducts();
        await redisClient.set("getAllProducts", JSON.stringify(allProducts));
        await redisClient.set("getAllProducts:validation", "true", { EX: 10 });
      }, 0);
    }
  }

  if (allProductsFromCash) {
    return res.send(JSON.parse(allProductsFromCash));
  }

  const products = await getAllProducts();
  // await redisClient.set("getAllProducts", JSON.stringify(products), { EX: 30 });
  await redisClient.set("getAllProducts", JSON.stringify(products));
  res.send(products);
});

const startApp = async () => {
  await redisClient.connect();

  app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
};

startApp();
