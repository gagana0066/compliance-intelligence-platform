console.log("SERVER STARTING...");
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => {
  res.json({ status: "Sentinel API running" });
});

app.get("/cases", async (_, res) => {
  const cases = await prisma.case.findMany({
    include: { findings: true },
  });
  res.json(cases);
});

app.post("/cases", async (req, res) => {
  const { clientName, caseType, owner, deadline, documentsCount } = req.body;

  const findings = [];

  if (documentsCount < 3) {
    findings.push({
      ruleId: "DOC_MIN",
      severity: "MEDIUM",
      message: "Less than 3 required documents uploaded",
    });
  }

  if (new Date(deadline) < new Date()) {
    findings.push({
      ruleId: "DEADLINE_BREACH",
      severity: "HIGH",
      message: "Filing deadline has passed",
    });
  }

  const newCase = await prisma.case.create({
    data: {
      clientName,
      caseType,
      owner,
      deadline: new Date(deadline),
      documentsCount,
      findings: {
        create: findings,
      },
    },
    include: { findings: true },
  });

  res.status(201).json(newCase);
});

app.listen(4000, () => {
  console.log("Sentinel API running on http://localhost:4000");
});