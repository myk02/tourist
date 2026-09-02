import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'

export default function SSOCallbackPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <AuthenticateWithRedirectCallback />
    </div>
  )
}
