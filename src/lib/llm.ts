import { config } from "./config";

export async function llmJSON<T>(system:string, user:string): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{ "Authorization": `Bearer ${config.openaiKey}`, "Content-Type":"application/json" },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: [{role:"system", content:system},{role:"user", content:user}],
      response_format: { type: "json_object" }
    })
  });
  if(!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content;
  return JSON.parse(txt);
}
