console.log("SERVER STARTING...");

import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { calculateRisk } from "./services/riskEngine";

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => {
  res.json({ status: "Compliance API running" });
});

app.get("/cases", async (_, res) => {
  const cases = await prisma.case.findMany({
    include: { findings: true },
  });
  res.json(cases);
});

app.post("/cases", async (req, res) => {
  try {
    const { clientName, caseType, owner, deadline, documentsCount } = req.body;

    const findings: any[] = [];

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

    // Create case with findings
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

    // Calculate risk
    const { riskScore, riskLevel } = calculateRisk(newCase.findings as any);

    // Update case with risk data
    await prisma.case.update({
      where: { id: newCase.id },
      data: {
        riskScore,
        riskLevel,
      },
    });

    // Fetch updated case
    const updatedCase = await prisma.case.findUnique({
      where: { id: newCase.id },
      include: { findings: true },
    });

    res.status(201).json(updatedCase);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(4000, () => {
  console.log("Sentinel API running on http://localhost:4000");
});