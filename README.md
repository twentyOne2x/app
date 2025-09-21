<a href="https://chat.mev.fyi/">
  <img alt="Next.js 13 and Llama index chatbot with enriched sources and default questions." src="https://chat.mev.fyi/opengraph-image.png">
  <h1 align="center">MEV.fyi Chatbot</h1>
</a>

<p align="center">
  An advanced AI chatbot application leveraging Next.js, Google Cloud Run, Pinecone, and AssemblyAI, refined with a wide array of content sources and preset inquiries.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#content-sources"><strong>Content Sources</strong></a> ·
  <a href="#default-questions"><strong>Default Questions</strong></a> ·
  <a href="#deploy-your-own"><strong>Deploy Your Own</strong></a> ·
  <a href="#running-locally"><strong>Running Locally</strong></a> ·
</p>
<br/>

## Features

- Utilizes the [Next.js](https://nextjs.org) framework for a seamless user experience.
- Incorporates React Server Components, Suspense, and Server Actions for dynamic content rendering.
- Features a streaming chat UI powered by the [Vercel AI SDK](https://sdk.vercel.ai/docs).
- Supports multiple AI models including OpenAI's gpt-3.5-turbo, with customization options for embedding and inference optimization.
- Edge runtime-ready with efficient latency handling for querying extensive datasets.
- Stylish UI components from [shadcn/ui](https://ui.shadcn.com), Tailwind CSS, Radix UI, and Phosphor Icons.
- Enhanced with chat history, rate limiting, and session storage capabilities.
- Secure authentication mechanisms provided by [NextAuth.js](https://github.com/nextauthjs/next-auth).

## Content Sources

Our chatbot enriches its responses with a diverse range of content sources, including:

- **YouTube Transcripts**: Automated extraction and filtering of video transcripts based on relevant keywords.
- **Research Papers and Articles**: Comprehensive coverage, with over 80% of relevant publications included.
- **Twitter Threads and Websites**: Indexed for future inclusion to broaden the information spectrum.
- **Podcasts and Books**: Integration of Spotify and Apple podcasts, alongside books under free license, to offer a wide array of insights and perspectives.
- **Author Index**: A specialized feature to find content by specific authors, enhancing user engagement with targeted searches.

## Default Questions

To facilitate user interaction, the chatbot comes preloaded with a set of default questions designed to showcase the depth and breadth of its knowledge base, including inquiries into latest research findings, detailed explanations of complex topics, and summaries of lengthy discussions or podcasts.

## Deploy Your Own

Deploy your personalized version of the MEV.fyi Chatbot using the following button. This will set up your project on Vercel, integrating all necessary components and configurations.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone)

Ensure you have all necessary environment variables set up, including those for accessing the Pinecone vector database, AssemblyAI for audio transcription, and your preferred authentication methods.

## Running Locally

To run the MEV.fyi Chatbot locally, you'll need to follow these steps, ensuring you have all the required environment variables set up as described in the `.env.example` file.

1. Install dependencies: `npm install` or `pnpm install`.
2. Start the development server: `npm run dev` or `pnpm dev`.

This will launch the application on [localhost:3000](http://localhost:3000/), where you can interact with the chatbot and explore its functionalities.