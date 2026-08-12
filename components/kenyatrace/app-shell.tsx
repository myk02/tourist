'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignInButton, UserButton, useUser } from '@clerk/nextjs'
import { Camera, CircleUserRound, Compass, Map, MapPin, Navigation, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

const nav = [{href:'/',label:'Discover',icon:Compass},{href:'/plan',label:'Plan',icon:Sparkles},{href:'/trips',label:'Trips',icon:Map},{href:'/moments',label:'Moments',icon:Camera},{href:'/profile',label:'Profile',icon:CircleUserRound}]
const links = (pathname:string) => nav.map(item => ({...item, active:item.href==='/'?pathname==='/' : pathname.startsWith(item.href)}))

export function KenyaTraceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <div className="min-h-screen bg-background text-foreground"><Header/><main className="pb-24 md:pl-24 md:pb-8"><DesktopRail pathname={pathname}/>{children}</main><MobileNav pathname={pathname}/></div>
}

function Header(){const {isSignedIn}=useUser();return <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-8"><Link href="/" className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Navigation className="size-5"/></span><span className="font-serif text-xl font-semibold tracking-tight">KenyaTrace</span></Link><div className="flex items-center gap-3"><span className="hidden items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:flex"><MapPin className="size-4 text-primary"/>Made for Kenya</span>{isSignedIn?<UserButton/>:<SignInButton mode="modal"><Button size="sm">Sign in</Button></SignInButton>}</div></header>}

function DesktopRail({pathname}:{pathname:string}){return <aside className="fixed bottom-0 left-0 top-16 hidden w-24 flex-col items-center gap-2 border-r bg-background py-6 md:flex">{links(pathname).map(item=>{const Icon=item.icon;return <Button key={item.href} variant={item.active?'secondary':'ghost'} className="h-16 w-20 flex-col gap-1" nativeButton={false} render={<Link href={item.href}/>}><Icon/><span className="text-xs">{item.label}</span></Button>})}</aside>}

function MobileNav({pathname}:{pathname:string}){return <nav className="fixed inset-x-0 bottom-0 z-40 flex h-20 items-center justify-around border-t bg-background md:hidden">{links(pathname).map(item=>{const Icon=item.icon;return <Button key={item.href} variant="ghost" className={item.active?'flex-col gap-1 text-primary':'flex-col gap-1 text-muted-foreground'} nativeButton={false} render={<Link href={item.href}/>}><Icon/><span className="text-xs">{item.label}</span></Button>})}</nav>}
