// app/share/[id]/opengraph-image.tsx
import { ImageResponse } from '@vercel/og'
import { getSharedChat } from '@/app/actions'
import fs from 'fs'
import path from 'path'

// Define image properties
export const alt = 'AI Chatbot'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

// Function to log the directory structure
function logDirectoryTree(dir: string, depth = 0) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);
    const indent = ' '.repeat(depth * 2); // Indentation for tree structure
    console.log(`${indent}${file}`);
    if (stats.isDirectory()) {
      logDirectoryTree(fullPath, depth + 1); // Recursively log subdirectories
    }
  });
}

// Manually load font data for Edge runtime
console.log('Current working directory (process.cwd()):', process.cwd());
// Log the directory structure of process.cwd() for debugging
console.log('Directory structure of current working directory:');
logDirectoryTree(process.cwd(), 0);
const interRegular = fs.readFileSync(path.join(process.cwd(), 'app/share/[id]/fonts/Inter-Regular.woff'))
const interBold = fs.readFileSync(path.join(process.cwd(), 'app/share/[id]/fonts/Inter-Bold.woff'))

interface ImageProps {
  params: {
    id: string
  }
}

export default async function Image({ params }: ImageProps) {
  const chat = await getSharedChat(params.id)

  if (!chat || !chat.sharePath) {
    return new ImageResponse(
      (
        <div
          style={{
            fontFamily: 'sans-serif',
            fontSize: 60,
            color: 'white',
            background: 'black',
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          Chat Not Found
        </div>
      ),
      size
    )
  }

  const textAlign = chat.title.length > 40 ? 'flex-start' : 'center'

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#09090b',
          color: 'white',
          padding: '80px',
          fontFamily: 'Inter, sans-serif', // Use font loaded manually
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div
            style={{
              height: '72px',
              width: '72px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '0.375rem',
              border: '1px solid #9b9ba4',
            }}
          >
            {/* SVG Icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              fill="currentColor"
              width={48}
              height={48}
            >
              <path d="M230.92 212c-15.23-26.33-38.7-45.21-66.09-54.16a72 72 0 1 0-73.66 0c-27.39 8.94-50.86 27.82-66.09 54.16a8 8 0 1 0 13.85 8c18.84-32.56 52.14-52 89.07-52s70.23 19.44 89.07 52a8 8 0 1 0 13.85-8ZM72 96a56 56 0 1 1 56 56 56.06 56.06 0 0 1-56-56Z"></path>
            </svg>
          </div>
          <div
            style={{
              fontWeight: 'bold',
              fontSize: '4rem',
              lineHeight: '1.2',
              marginLeft: '2.5rem',
            }}
          >
            {chat.title.length > 120 ? `${chat.title.slice(0, 120)}...` : chat.title}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: '3.5rem' }}>
          <div
            style={{
              height: '72px',
              width: '72px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '0.375rem',
              border: '1px solid #9b9ba4',
            }}
          >
            {/* Another SVG Icon */}
            <svg
              fill="currentColor"
              viewBox="0 0 24 24"
              role="img"
              xmlns="http://www.w3.org/2000/svg"
              width={48}
              height={48}
            >
              <path d="M24 22.525H0l12-21.05 12 21.05z" />
            </svg>
          </div>
          <div
            style={{
              fontWeight: 'bold',
              fontSize: '6rem',
              lineHeight: '1',
              marginLeft: '2.5rem',
            }}
          >
            ...
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginTop: 'auto',
            fontSize: '1.8rem',
            color: '#9b9ba4',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <svg
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              fill="#9b9ba4"
              width={40}
              height={40}
            >
              <path d="M24 22.525H0l12-21.05 12 21.05z" />
            </svg>
            <div style={{ display: 'flex', marginLeft: '1rem', color: '#eaeaf0' }}>
              Built with <span style={{ marginLeft: '0.5rem', marginRight: '0.5rem' }}>Vercel AI SDK</span> &amp; <span style={{ marginLeft: '0.5rem' }}>KV</span>
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', marginLeft: 'auto', color: '#9b9ba4' }}>chat.vercel.ai</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Inter',
          data: interRegular, // Load manually using fs
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Inter',
          data: interBold, // Load manually using fs
          style: 'normal',
          weight: 700,
        },
      ],
    }
  )
}
