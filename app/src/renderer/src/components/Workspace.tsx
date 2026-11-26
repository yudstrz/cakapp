import { WorkspaceFolders } from '../folders'
import { AudioUploadHost } from './AudioUpload'
import { toasts } from './TrashToast'
import { askDestination } from '../../../shared/askContext'
import { Tooltip } from '@base-ui/react/tooltip'
import { ActionTooltipPopup } from './ActionTooltipPopup'
import { useSidebarPeek } from '../useSidebarPeek'
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, MeetingFile, AskBubble, Search, SidebarToggle, UserRound } from './Icons'
import { Logo } from './Logo'
import type { AuthState, MeetingView, Folder, WidgetView } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { command, keys, onMac } from '../keys'
import { LevelBars } from './LevelBars'
import { RecordingTime } from './RecordingTime'
import { FoldersNav } from './FoldersNav'
import { FinishSetup } from './FinishSetup'
import { NotesSetup } from './NotesSetup'
import { CornerMenu } from './CornerMenu'
import { Modal, ModalClose } from './Modal'
import { AuthSettings } from './AuthSettings'

export function Workspace({ route, meeting, folders, go, back, forward, search, shortcuts, collapsed, sidebarMotion, toggleSidebar, children }: {
  meeting?: Pick<MeetingView, 'id' | 'title'>
  folders?: Folder[]
  route: string; go: (route: string) => void; back?: () => void; forward?: () => void; search: () => void; shortcuts: () => void; children: ReactNode
  collapsed: boolean; sidebarMotion: boolean; toggleSidebar: (animate?: boolean) => void
}) {
  const [recording, setRecording] = useState<WidgetView | null>(null)
  const [auth, setAuth] = useState<AuthState>()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  useEffect(() => {
    let active = true
    void window.yogurt.auth.state().then(s => { if (active) setAuth(s) }).catch(() => {})
    const offIpc = window.yogurt.auth.onChanged(next => { if (active) setAuth(next) })
    const onAuthChanged = (e: Event) => {
      const next = (e as CustomEvent<AuthState>).detail
      if (next) setAuth(next)
      else void window.yogurt.auth.state().then(setAuth).catch(() => {})
    }
    window.addEventListener('cakapp:auth-changed', onAuthChanged)
    return () => { active = false; offIpc(); window.removeEventListener('cakapp:auth-changed', onAuthChanged) }
  }, [])
  useEffect(() => {
    let active = true, updated = false
    const off = window.yogurt.widget.onState((view) => { updated = true; setRecording(view) })
    void window.yogurt.widget.state().then((view) => { if (active && !updated) setRecording(view) })
    return () => { active = false; off() }
  }, [])
  const peek = useSidebarPeek(collapsed, route)
  const sidebarVisible = !collapsed || peek.open
  const sidebarLabel = collapsed ? t('Show sidebar') : t('Hide sidebar')
  const navigate = (next: string) => { if (peek.open) peek.dismiss(); go(next) }
  const note = route.startsWith('/note/')
  // a saved chat (/chat/<id>) is still under Chat
  const section = route.startsWith('/settings/') ? '/settings' : route.startsWith('/chat/') ? '/chat' : route
  const returnToRecording = recording?.kind === 'recording' && route !== `/note/${recording.meetingId}`
  useEffect(() => {
    const ask = () => {
      if (document.querySelector('[aria-modal="true"]:not([data-testid="chat-panel"]), [role="alertdialog"]')) return
      const target = askDestination(route)
      if (target.kind === 'focus') document.getElementById('library-question')?.focus({ preventScroll: true })
      else if (target.kind === 'panel') document.getElementById('meeting-ask')?.click()
      else void window.yogurt.conversations.current(target.chips).then(id => go(`/chat/${id}`)).catch(error => {
        console.error('Opening Ask failed', error)
        toasts.add({ title: t("Cakapp couldn't make that change. Try again.") })
      })
    }
    const key = (e: KeyboardEvent) => {
      if (!command(e) || (onMac() && e.ctrlKey) || e.altKey || e.shiftKey || e.code !== 'KeyJ' || e.defaultPrevented) return
      e.preventDefault()
      if (!e.repeat && !e.isComposing) ask()
    }
    const fromMenu = () => { void window.yogurt.nav.takeAsk().then(pending => { if (pending) ask() }) }
    const off = window.yogurt.nav.onAsk(fromMenu)
    fromMenu()
    window.addEventListener('keydown', key)
    return () => { off(); window.removeEventListener('keydown', key) }
  }, [route, go])
  const links = [
    { route: '', label: t('Meetings'), Icon: MeetingFile },
    { route: '/chat', label: t('Ask'), Icon: AskBubble },
  ]
  const folder = route.startsWith('/folder/') ? folders?.find((s) => route === `/folder/${s.id}`) : undefined
  const current = links.find((link) => link.route === section) ?? (route.startsWith('/folder/') ? { label: folder?.name ?? t('Folder') } : undefined)
  const label = note ? (meeting && route === `/note/${meeting.id}` ? meeting.title : t('Meeting')) : route.startsWith('/settings') ? t('Settings') : route === '/trash' ? t('Trash') : current?.label ?? t('Meetings')
  const nav = (link: typeof links[number]) => <button key={link.route} data-testid={link.route === '' ? 'nav-home' : 'nav-chat'}
    data-sidebar="menu-button" aria-label={link.label} className="workspace-nav" aria-current={section === link.route || link.route === '' && route === '/meetings' ? 'page' : undefined} onClick={() => navigate(link.route)}>
    <link.Icon size={16} aria-hidden="true" /><span>{link.label}</span>
  </button>

  return <div className={`workspace ${collapsed ? 'sidebar-collapsed' : ''}`} data-testid="workspace" {...peek.buttonPathHandlers} data-sidebar-motion={sidebarMotion} data-peeking={peek.open} data-peek-motion={peek.pointerMotion}>
    <header className="workspace-topbar drag" data-note={note} data-recording-return={returnToRecording} data-testid="titlebar">
      <div className="workspace-topbar-left no-drag">
        <button type="button" className="workspace-brand no-drag" onClick={() => navigate('')} aria-label="Cakapp">
          <Logo size={20} />
          <span className="workspace-brand-name">Cakapp</span>
        </button>
        <span className="workspace-history">
          <button data-testid="nav-back" className="ghost-btn workspace-icon no-drag" disabled={!back && !note} onClick={back ?? (() => go(''))} aria-label={t('Back')} title={`${t('Back')} (${keys('⌘[')})`}><ChevronLeft size={14} className="rtl:-scale-x-100" aria-hidden="true" /></button>
          <button data-testid="nav-forward" className="ghost-btn workspace-icon no-drag" disabled={!forward} onClick={forward} aria-label={t('Forward')} title={`${t('Forward')} (${keys('⌘]')})`}><ChevronRight size={14} className="rtl:-scale-x-100" aria-hidden="true" /></button>
        </span>
        <nav className="workspace-primary-tabs" aria-label={t('Workspace')}>
          {links.map(nav)}
        </nav>
        <Tooltip.Root>
          <Tooltip.Trigger ref={peek.toggle} {...peek.buttonHandlers} className="ghost-btn workspace-icon workspace-folders-toggle no-drag" data-testid={collapsed ? 'sidebar-expand' : 'sidebar-collapse'}
            onClick={e => { peek.cancel(); toggleSidebar(e.detail > 0) }}
            onKeyDown={e => { if (collapsed && e.key === 'ArrowDown') { e.preventDefault(); peek.keyboard() } }}
            aria-expanded={sidebarVisible} aria-controls="workspace-sidebar" aria-keyshortcuts={onMac() ? 'Control+Meta+S' : 'Control+Shift+S'}
            aria-label={sidebarLabel} delay={1000}>
            <SidebarToggle className="flex-none sidebar-toggle-glyph rtl:-scale-x-100" size={16} aria-hidden="true" />
          </Tooltip.Trigger>
          <ActionTooltipPopup label={`${sidebarLabel} (${keys('⌃⌘S')})`} />
        </Tooltip.Root>
        <span className="workspace-breadcrumb-sep" aria-hidden="true">/</span>
        <span data-testid="workspace-heading" className="workspace-heading-pill" aria-current="page" title={label}>{label}</span>
      </div>
      <div className="workspace-topbar-right no-drag">
        <button className="workspace-search no-drag" data-testid="search-open" aria-label={t('Search')} title={`${t('Search')} (${keys('⌘K')})`} onClick={search}>
          <Search className="flex-none" size={14} aria-hidden="true" />
          <span>{t('Search')}</span>
          <kbd>{keys('⌘K')}</kbd>
        </button>
        <NotesSetup go={go} />
        <button
          type="button"
          data-testid="toolbar-auth-button"
          className="bar-btn no-drag flex items-center gap-1.5"
          title={auth?.user ? `${auth.user.name || auth.user.email} (Cloud Aktif)` : 'Masuk atau Daftar Akun'}
          onClick={() => setAuthModalOpen(true)}
        >
          <UserRound size={14} aria-hidden="true" />
          <span className="truncate max-w-[120px]">{auth?.user ? (auth.user.name || auth.user.email) : 'Masuk / Daftar'}</span>
        </button>
        {returnToRecording && <button className="workspace-recording-link no-drag" data-testid="recording-return" data-paused={recording.paused}
          aria-label={t('Open {title}', { title: recording.title })} title={t('Open {title}', { title: recording.title })} onClick={() => go(`/note/${recording.meetingId}`)}>
          <LevelBars testId="recording-return-wave" height={16} paused={recording.paused} />
          <RecordingTime view={recording} testId="recording-return-time" className="recording-return-time" />
        </button>}
        <div id="workspace-actions" className="workspace-toolbar-actions" />
        <div id="workspace-agenda-actions" className="workspace-toolbar-actions" />
        <CornerMenu visible={true} section={section} recording={recording?.kind === 'recording'} go={navigate} shortcuts={shortcuts} />
      </div>
    </header>
    <div ref={peek.panel} id="workspace-sidebar" className="workspace-folders-ribbon" role="complementary" aria-label={t('Main navigation')}
      inert={!sidebarVisible} aria-hidden={!sidebarVisible} onPointerEnter={peek.cancel} onPointerLeave={peek.leave}>
      <div className="workspace-ribbon-inner">
        <FoldersNav folders={folders} route={route} go={navigate} />
        <div className="workspace-ribbon-right">
          <FinishSetup />
        </div>
      </div>
    </div>
    {authModalOpen && (
      <Modal
        testId="auth-modal"
        title={auth?.user ? 'Akun Cloud Cakapp' : 'Masuk atau Daftar Akun'}
        description={auth?.user ? 'Akun terhubung ke Neon Cloud Portal.' : 'Sinkronkan rapat dan notulen Anda ke Cloud Web Portal, atau lanjutkan secara offline dengan Mode Tamu.'}
        onCancel={() => setAuthModalOpen(false)}
      >
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <AuthSettings onDone={() => setAuthModalOpen(false)} />
        </div>
        <div className="modal-actions mt-4">
          <ModalClose data-dialog-cancel className="workspace-button">Tutup</ModalClose>
        </div>
      </Modal>
    )}
    <div className="workspace-content" {...peek.edgeHandlers}>
      <WorkspaceFolders value={folders}>{children}</WorkspaceFolders>
      <AudioUploadHost />
    </div>
  </div>
}
