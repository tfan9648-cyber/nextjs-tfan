import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { companies } = await req.json();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const allNews = await Promise.all(companies.map(async (company: string) => {
      const prompt = `你是一个财经专家。请为“${company}”生成一条今天的核心要闻。要求：1.标题含日期和公司名。2.正文300字以内。3.提供一个url链接。直接返回JSON: {"title":"..","summary":"..","url":".."}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json|```/g, "").trim();
      return JSON.parse(text);
    }));
    return NextResponse.json(allNews);
  } catch (error) {
    return NextResponse.json({ error: "抓取失败" }, { status: 500 });
  }
}
