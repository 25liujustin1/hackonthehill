import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { title, caption } = await req.json();

  const prompt = `You are a content moderator for a university campus photo sharing app.

Review the following user-submitted text and respond with only "true" if it is appropriate, or "false" if it clearly contains hate speech, slurs, explicit threats, or graphic sexual content.

Normal campus life content like food, studying, sports, socializing, and general comments should always be approved.

Title: "${title}"
Caption: "${caption ?? "none"}"

Respond with only "true" or "false". No explanation. If unsure, respond true.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  const data = await response.json();
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
  console.log("Gemini raw result:", result);
  const isAppropriate = result === "true";

  return NextResponse.json({ appropriate: isAppropriate });
}