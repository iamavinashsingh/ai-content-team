import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';

async function test() {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
    maxTokens: 10,
  });
  
  try {
    const res = await llm.invoke("Say hello");
    console.log("Success:", res.content);
  } catch (err) {
    console.error("OpenAI Error:", err.message);
  }
}

test();
