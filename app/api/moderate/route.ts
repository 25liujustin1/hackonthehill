import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { title, caption, imageUrl } = await req.json();

  const prompt = `You are a content moderator for a university campus app. 
Respond with ONLY the single word "true" if the content is appropriate.
Respond with ONLY the single word "false" if it contains violence, hate, threats, slurs, or sexual content.
Do not explain. Do not add punctuation. Just "true" or "false.

Title: ${title}
Caption: ${caption ?? "none"}
Image URL: ${imageUrl ?? "none"}

It is important that you only respond with only "true" or "false". If you are unsure, just allow it and respond true. If it has the word "love" in it, return true. if it has the word "hate in it, return false`;

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

return NextResponse.json({ appropriate: isAppropriate ?? true });
}