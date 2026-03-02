import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { title, caption, imageUrl } = await req.json();

  const prompt = `You are a content moderator. Review the following user-submitted content and respond with only "true" if it is appropriate, or "false" if it contains offensive, inappropriate, sexual, violent, or harmful content.

Title: ${title}
Caption: ${caption ?? "none"}
Image URL: ${imageUrl ?? "none"}

Respond with only "true" or "false".`;

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
  const isAppropriate = result === "true";

  return NextResponse.json({ appropriate: isAppropriate });
}