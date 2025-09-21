import { kv } from '@vercel/kv';
import { Configuration } from 'openai-edge';
import { auth } from '@/auth';
import { nanoid } from '@/lib/utils';
import { parseMetadata } from '@/lib/utils';
import { ParsedMetadataEntry } from '@/lib/types';

// Configuration for OpenAI API
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  console.log('route.ts: Received POST request from user');

  let json;
  try {
    json = await req.json();
  } catch (error) {
    console.error('route.ts: Error parsing JSON body:', error);
    return new Response('Bad request', { status: 400 });
  }

  const { messages, previewToken } = json;
  const session = await auth();

  // Check for anonymous user or authenticated user
  const isAnonymous = !session?.user?.id || session.user.id === null;
  const userId = isAnonymous ? 'anonymous' : session.user.id;

  if (!userId && !isAnonymous) {
    console.error('route.ts: Unauthorized request: No session user found.');
    return new Response('Unauthorized', { status: 401 });
  }

  if (previewToken) {
    configuration.apiKey = previewToken;
  }

  const mostRecentMessageContent = messages.length > 0 ? messages[messages.length - 1].content : "No messages yet.";
  const backendChatUrl = `${process.env.REACT_APP_BACKEND_URL}/chat`;

  let chatResponse;
  try {
    chatResponse = await fetch(backendChatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: mostRecentMessageContent, chat_history: messages }),
    });
  } catch (error) {
    console.error('route.ts: Fetch to backend chat failed:', error);
    return new Response('Internal Server Error', { status: 500 });
  }

  if (!chatResponse.ok) {
    console.error(`route.ts: Backend failed to process chat message with status ${chatResponse.status}`);
    return new Response(`Error from backend service: ${chatResponse.statusText}`, { status: chatResponse.status });
  }

  const responseBody = await chatResponse.json();

  let structuredMetadata: ParsedMetadataEntry[] = [];
  if (responseBody.formatted_metadata) {
    structuredMetadata = parseMetadata(responseBody.formatted_metadata);
  }

  const title = messages[0]?.content.substring(0, 100) || "New Chat";
  const id = json.id ?? nanoid();
  const createdAt = Date.now();
  const path = `/chat/${id}`;

  // Check for null or undefined values
  const checkForInvalidValues = (obj: Record<string, any>): boolean => {
    for (const key in obj) {
      if (obj[key] === null || obj[key] === undefined) {
        console.error(`Invalid value found at key: ${key}`);
        return true;
      }
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        if (checkForInvalidValues(obj[key])) {
          return true;
        }
      }
    }
    return false;
  };

  const payload = {
    id,
    title,
    userId: userId,
    createdAt,
    path,
    messages: [
      ...messages,
      {
        content: responseBody.response?.response || responseBody.response,
        role: 'assistant',
      },
    ],
    structured_metadata: structuredMetadata,
  };

  if (checkForInvalidValues(payload)) {
    console.error('Payload contains invalid values. Aborting storage.');
    return new Response('Invalid payload', { status: 400 });
  }

  try {
    // await kv.set(`chat:${id}`, JSON.stringify(payload));
    await kv.hmset(`chat:${id}`, payload);
    if (!isAnonymous) {
      await kv.zadd(`user:chat:${session.user.id}`, { score: createdAt, member: `chat:${id}` });
    }
    console.log('route.ts: Chat record stored');
  } catch (error) {
    console.error('Failed to store chat record:', error);
    return new Response('Internal Server Error', { status: 500 });
  }

  // Process the response content to replace specified phrases with "MEV"
  const processResponseContent = (content: string): string => {
    let processedContent = content;
    processedContent = processedContent.replace(/MEV \(Maximal Extractable Value\)/g, "MEV");
    processedContent = processedContent.replace(/Maximal Extractable Value \(MEV\)/g, "MEV");
    processedContent = processedContent.replace(/Maximal Extractable Value/g, "MEV");
    return processedContent;
  };

  // Then, when constructing the responsePayload or payload, use the processed content
  const responseContent = responseBody.response?.response || responseBody.response;
  const processedResponseContent = processResponseContent(responseContent);


  // Create a new payload with only the last message
  const responsePayload = {
    id: payload.id,
    title: payload.title,
    userId: payload.userId,
    createdAt: payload.createdAt,
    path: payload.path,
    message: {
      content: processedResponseContent, // Updated to use processed content
      role: 'assistant',
    },
    structured_metadata: payload.structured_metadata,
  };

  return new Response(JSON.stringify(responsePayload), {  // TODO 2024-03-04: why sending whole chat back instead of the last response?
    headers: { 'Content-Type': 'application/json' },
  });
}
