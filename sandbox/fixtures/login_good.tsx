export default function App() {
  return (
    <form className="mx-auto mt-10 flex max-w-sm flex-col gap-3 p-6">
      <h1 className="text-2xl font-bold">Log in</h1>
      <input type="email" placeholder="Email" className="rounded border p-2" />
      <input type="password" placeholder="Password" className="rounded border p-2" />
      <button type="submit" className="rounded bg-black p-2 text-white">Sign in</button>
    </form>
  )
}
