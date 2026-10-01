'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Check, Link2, Loader2, Mail, Send, Trash2, UserRound, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { isEmail, normalizeEmail } from '@/lib/email'
import { cn } from '@/lib/utils'

/**
 * Share dialog for a trip. The owner (and editors) can copy an invite link
 * that grants anyone who opens it a role on the trip, or email it directly to
 * a companion. The owner manages collaborator roles and removes people. All
 * updates are live via Convex, so collaborators see changes in real time.
 *
 * Pass `open` + `onOpenChange` for controlled mode (e.g. opened from a
 * dropdown menu item) — the default trigger button is then not rendered.
 */
export function ShareTripDialog({ tripId, tripName, myRole: _myRole, isOwner, triggerClassName, open: controlledOpen, onOpenChange }: { tripId: Id<'trips'>; tripName: string; myRole: string; isOwner: boolean; triggerClassName?: string; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpenState] = useState(false)
  // Controlled mode (open prop) skips the built-in trigger entirely — the
  // parent owns when the dialog is shown.
  const setOpen = (o: boolean) => {
    setOpenState(o)
    onOpenChange?.(o)
  }
  const isOpen = controlledOpen ?? open
  const shares = useQuery(api.trips.listShares, { tripId })
  const me = useQuery(api.users.me)
  const createLink = useMutation(api.trips.createShareLink)
  const updateShare = useMutation(api.trips.updateShare)
  const removeShare = useMutation(api.trips.removeShare)
  const [linkRole, setLinkRole] = useState<'editor' | 'viewer'>('editor')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<Id<'tripShares'> | null>(null)
  const [email, setEmail] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Destructive removes (a person, or the live invite link) confirm first —
  // a stray tap used to cut someone off with no warning.
  const [pendingRemove, setPendingRemove] = useState<{ shareId: Id<'tripShares'>; label: string } | null>(null)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      return true
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access')
      return false
    }
  }

  async function makeLink() {
    setCreating(true)
    try {
      const { token } = await createLink({ tripId, role: linkRole })
      const ok = await copy(`${window.location.origin}/trips/${tripId}?invite=${token}`)
      if (ok) toast.success('Invite link copied — anyone with it can join')
    } catch {
      toast.error('Could not create an invite link')
    } finally {
      setCreating(false)
    }
  }

  async function sendInvite() {
    const to = normalizeEmail(email)
    if (!isEmail(to)) { setEmailError('Enter a valid email address'); return }
    setEmailError(null)
    setSending(true)
    try {
      // The email must promise exactly what the link grants. Owners align the
      // link (createShareLink patches an existing link's role) to the role
      // chosen in the dialog; editors send the existing link as it is.
      let token = shares?.link?.token ?? null
      let effectiveRole = isOwner ? linkRole : (shares?.link?.role as 'editor' | 'viewer' | undefined) ?? linkRole
      if (isOwner) {
        const res = await createLink({ tripId, role: linkRole })
        token = res.token
        effectiveRole = linkRole
      }
      if (!token) throw new Error('No invite link available yet')
      const res = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to,
          tripId,
          token,
          tripName,
          role: effectiveRole,
          senderName: me?.name ?? 'A traveller',
          message: emailMessage.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send the invite')
      setSentTo(to)
      setEmail('')
      setEmailMessage('')
      toast.success(`Invite sent to ${to}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the invite')
    } finally {
      setSending(false)
    }
  }

  async function changeRole(shareId: Id<'tripShares'>, role: string) {
    setBusy(shareId)
    try {
      await updateShare({ shareId, role })
      toast.success(`Role updated to ${role === 'viewer' ? 'viewer' : 'editor'}`)
    } catch {
      toast.error('Could not update role')
    } finally {
      setBusy(null)
    }
  }

  async function remove(shareId: Id<'tripShares'>, label: string) {
    setBusy(shareId)
    try {
      await removeShare({ shareId })
      toast.success(`${label} removed`)
      setPendingRemove(null)
    } catch {
      toast.error('Could not remove')
    } finally {
      setBusy(null)
    }
  }

  const link = shares?.link ?? null
  const emailReady = isOwner || !!link

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <Button variant="outline" className={cn('gap-1.5', triggerClassName)} onClick={() => setOpen(true)}>
          <Users className="size-4" />
          Share
        </Button>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this trip</DialogTitle>
          <DialogDescription>
            Invite travel companions to view or edit this itinerary together — changes sync live for everyone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5 rounded-none border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4 text-primary" /> Invite link</p>
              {!isOwner && <Badge variant="outline" className="text-[10px] text-muted-foreground">Visible to editors</Badge>}
            </div>
            {link && (
              <p className="truncate rounded-none bg-muted px-3 py-2 font-mono text-xs text-muted-foreground" title="Full link hidden — use Copy link">
                {typeof window !== 'undefined' ? `${window.location.origin}/trips/${tripId}?invite=…${link.token.slice(-4)}` : `Invite link ending …${link.token.slice(-4)}`}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {isOwner ? (
                <>
                  <Select value={linkRole} onValueChange={v => setLinkRole(v === 'viewer' ? 'viewer' : 'editor')}>
                    <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Can edit</SelectItem>
                      <SelectItem value="viewer">Can view</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="gap-1.5" onClick={makeLink} disabled={creating}>
                    {creating ? <Loader2 className="size-3.5 animate-spin" /> : copied && link ? <Check className="size-3.5" /> : null}
                    {copied && link ? 'Copied' : link ? 'Copy link' : 'Create invite link'}
                  </Button>
                  {link && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy === link.shareId} onClick={() => setPendingRemove({ shareId: link.shareId, label: 'Invite link' })}>
                      <Trash2 className="size-3.5" /> Revoke
                    </Button>
                  )}
                </>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => link && copy(`${window.location.origin}/trips/${tripId}?invite=${link.token}`)} disabled={!link}>
                  {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {link ? 'Anyone with this link can join as shown. You can revoke it any time.' : 'Create a link to invite travel companions by message or email.'}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 rounded-none border bg-card p-4 shadow-soft">
            <p className="flex items-center gap-2 text-sm font-semibold"><Mail className="size-4 text-primary" /> Invite by email</p>
            <Input
              type="email"
              aria-label="Companion's email"
              placeholder="companion@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setSentTo(null) }}
              disabled={!emailReady}
            />
            <Input
              aria-label="Note to include"
              placeholder="Add a short note (optional)"
              value={emailMessage}
              onChange={e => setEmailMessage(e.target.value)}
              disabled={!emailReady}
            />
            {emailError && <p className="text-xs text-destructive">{emailError}</p>}
            {sentTo && <p className="flex items-center gap-1 text-xs font-medium text-primary">Invite sent to {sentTo} <Check className="size-3" /></p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button size="sm" className="gap-1.5" onClick={sendInvite} disabled={sending || !emailReady}>
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {sending ? 'Sending…' : 'Send invite'}
              </Button>
              {!emailReady && <p className="text-xs text-muted-foreground">Ask the trip owner to create an invite link first.</p>}
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-primary" /> Collaborators</p>
            {shares === undefined && <p className="text-sm text-muted-foreground">Loading…</p>}
            {shares && shares.collaborators.length === 0 && (
              <p className="text-sm text-muted-foreground">No one yet — share the invite link to add travel companions.</p>
            )}
            {shares?.collaborators.map(c => (
              <div key={c.shareId} className={cn('flex items-center gap-3 rounded-none border p-2.5', busy === c.shareId && 'opacity-60')}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-none bg-secondary text-xs font-bold text-primary">
                  {c.image ? <img src={c.image} alt={c.name} referrerPolicy="no-referrer" className="size-9 rounded-none object-cover" /> : <UserRound className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.role === 'editor' ? 'Can edit' : 'Can view'}</p>
                </div>
                {isOwner ? (
                  <>
                    <Select value={c.role} onValueChange={v => changeRole(c.shareId, v ?? 'viewer')} disabled={busy === c.shareId}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${c.name}`} disabled={busy === c.shareId} onClick={() => setPendingRemove({ shareId: c.shareId, label: c.name })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline" className="text-[10px]">{c.role === 'editor' ? 'Editor' : 'Viewer'}</Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {pendingRemove && (
          <div className="rounded-none border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold">{pendingRemove.label === 'Invite link' ? 'Revoke the invite link?' : `Remove ${pendingRemove.label}?`}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingRemove.label === 'Invite link'
                ? 'Anyone who hasn\u2019t opened it yet will lose access. You can create a new link afterwards.'
                : 'They will immediately lose access to this trip. The owner can re-invite them any time.'}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPendingRemove(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy === pendingRemove.shareId}
                onClick={() => { void remove(pendingRemove.shareId, pendingRemove.label) }}
              >
                {busy === pendingRemove.shareId ? 'Working…' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
