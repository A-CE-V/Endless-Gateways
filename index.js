import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";

import { db } from "./shared/firebaseAdmin.js";

const app = express();
const port = process.env.PORT || 3001;

// CORS setup
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// Helper to get user API key from Firebase token
async function getUserApiKey(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing or invalid Authorization header");

  const admin = (await import("firebase-admin")).default;
  const idToken = authHeader.split("Bearer ")[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  const uid = decoded.uid;

  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) throw new Error("User not found in Firestore");

  const apiKey = userDoc.data()?.api?.key;
  if (!apiKey) throw new Error("User API key not found");

  return apiKey;
}

// Send JSON request
async function sendJsonRequest(targetUrl, body, apiKey) {
  return axios.post(targetUrl, body, {
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    responseType: "arraybuffer",
  });
}

// Send file/form request
async function sendFormRequest(targetUrl, file, body, apiKey) {
  const form = new FormData();
  if (file) form.append("image", file.buffer, file.originalname);
  for (const [key, value] of Object.entries(body)) {
    form.append(key, value);
  }

  return axios.post(targetUrl, form, {
    headers: {
      ...form.getHeaders(),
      "x-api-key": apiKey,
    },
    responseType: "arraybuffer",
  });
}

// Proxy endpoint
app.post("/api/proxy/:service", upload.single("image"), async (req, res) => {
  try {
    const { service } = req.params;
    const apiKey = await getUserApiKey(req);

    const serviceMap = {
      vectors: "https://endless-vectors-gxda.onrender.com/convert",
      images: "https://endless-images-second-life.onrender.com/convert",
      contact: "https://endless-bureaucracy.onrender.com/contact",
      profilepicture: "https://endless-bureaucracy.onrender.com/upload-profile-pic",
      profilename: "https://endless-bureaucracy.onrender.com/update-profile-name",

      codedetect: "https://endless-code-tools-api.onrender.com/detect",
      codecompact: "https://endless-code-tools-api.onrender.com/compact",
      codeuncompact: "https://endless-code-tools-api.onrender.com/uncompact",
      codeformat: "https://endless-code-tools-api.onrender.com/format",
    };

    const targetUrl = serviceMap[service];
    if (!targetUrl) return res.status(400).json({ error: "Unknown service" });

    const response = req.file
      ? await sendFormRequest(targetUrl, req.file, req.body, apiKey)
      : await sendJsonRequest(targetUrl, req.body, apiKey);

    res.set("Content-Type", response.headers["content-type"]);
    res.send(Buffer.from(response.data));
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).json({
      error: "Proxy failed",
      details: err.message,
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", uptime: process.uptime(), service: "Endless Gateway API" });
});

app.listen(port, () => {
  console.log(`Endless Gateway API running on port ${port}`);
});
