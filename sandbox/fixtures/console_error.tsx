import { useEffect } from 'react'

export default function App() {
  useEffect(() => {
    console.error('boom')
  }, [])
  return <p>hello</p>
}
