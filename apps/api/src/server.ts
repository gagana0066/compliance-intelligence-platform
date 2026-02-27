import "dotenv/config";
import cors from "cors";
import express from "express";
import {
  createCaseHandler,
  getCasesHandler,
  getRiskTrendsHandler,
  reevaluateFirmHandler,
} from "./controllers/casesController";
import {
  createRuleHandler,
  getRulesHandler,
  toggleRuleHandler,
  updateRuleHandler,
} from "./controllers/rulesController";
import { ensureDefaultFirmAndAdmin } from "./services/ruleService";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", async (_, res) => {
  res.json({ status: "Compliance API running" });
});

app.get("/cases", getCasesHandler);
app.post("/cases", createCaseHandler);
app.post("/cases/reevaluate", reevaluateFirmHandler);

app.get("/analytics/risk-trends", getRiskTrendsHandler);

app.get("/rules", getRulesHandler);
app.post("/rules", createRuleHandler);
app.patch("/rules/:id", updateRuleHandler);
app.post("/rules/:id/toggle", toggleRuleHandler);

const port = Number(process.env.PORT ?? 4000);

ensureDefaultFirmAndAdmin()
  .then((firm) => {
    app.listen(port, () => {
      console.log(
        `Compliance Intelligence Platform API running on http://localhost:${port} (default firm: ${firm.slug})`
      );
    });
  })
  .catch((error) => {
    console.error("Failed bootstrapping baseline data", error);
    process.exit(1);
  });
