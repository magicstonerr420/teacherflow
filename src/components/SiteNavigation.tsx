import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { ChevronDown, LogOut, Menu, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useBetaStatus } from '@/hooks/useBetaStatus';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';

const activeProps = {className:'bg-accent text-accent-foreground', 'aria-current':'page' as const};

export function SiteNavigation() {
  const {isAuthenticated,status:beta} = useBetaStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen,setMobileOpen] = useState(false);
  const [signingOut,setSigningOut] = useState(false);
  const mobileDestination = useRef<string|null>(null);
  const close = ()=>setMobileOpen(false);
  function closeAfterNavigation(event:MouseEvent<HTMLAnchorElement>) {
    if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
    if(mobileOpen)mobileDestination.current=event.currentTarget.hash.slice(1);
    close();
  }
  useEffect(close,[location.href]);
  useEffect(()=>{
    const desktop=window.matchMedia('(min-width: 1024px)');
    const resize=()=>{if(desktop.matches)setMobileOpen(false);};
    desktop.addEventListener('change',resize);
    return ()=>desktop.removeEventListener('change',resize);
  },[]);
  async function signOut() {
    if(signingOut)return;
    setSigningOut(true);
    try {
      const {error}=await supabase.auth.signOut();
      if(error)throw error;
      close();await navigate({to:'/'});
    } catch {toast.error('Could not sign out. Please try again.');}
    finally {setSigningOut(false);}
  }
  function primaryLinks(mobile=false) {
    const classes=mobile?'w-full justify-start py-5':'';
    return <>
      <Button variant="ghost" size="sm" className={classes} asChild><Link to="/examples" search={{}} activeProps={activeProps} onClick={closeAfterNavigation}>Examples</Link></Button>
      <Button variant="ghost" size="sm" className={classes} asChild><Link to="/builder" activeProps={activeProps} onClick={closeAfterNavigation}>Lesson builder</Link></Button>
      {isAuthenticated && <Button variant="ghost" size="sm" className={classes} asChild><Link to="/lessons" activeProps={activeProps} onClick={closeAfterNavigation}>My lessons</Link></Button>}
      <Button variant="ghost" size="sm" className={classes} asChild><Link to="/quick-start" activeProps={activeProps} onClick={closeAfterNavigation}>Quick-start guide</Link></Button>
      <Button variant="ghost" size="sm" className={classes} asChild><Link to="/about" activeProps={activeProps} onClick={closeAfterNavigation}>About us</Link></Button>
    </>;
  }
  return <>
    <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
      {primaryLinks()}
      {isAuthenticated ? <>
        {beta?.owner && <Button variant="ghost" size="sm" asChild><Link to="/beta-management" hash="overview" activeProps={activeProps}><ShieldCheck className="size-4"/>Management</Link></Button>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="ml-2"><UserRound className="size-4"/>Account<ChevronDown className="size-3.5"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" aria-label="Account">
            <DropdownMenuItem asChild><Link to="/profile">My profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/auth" search={{password:true}}>Set/change password</Link></DropdownMenuItem>
            <DropdownMenuSeparator/>
            <DropdownMenuItem disabled={signingOut} onSelect={()=>void signOut()}><LogOut className="size-4"/>{signingOut?'Signing out…':'Sign out'}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </> : <Button variant="outline" size="sm" className="ml-2" asChild><Link to="/auth">Sign in</Link></Button>}
    </nav>
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild><Button variant="outline" size="sm" className="lg:hidden"><Menu className="size-4"/>Menu</Button></SheetTrigger>
      <SheetContent className="w-[88vw] overflow-y-auto sm:max-w-sm" onCloseAutoFocus={event=>{
        const hash=mobileDestination.current;
        mobileDestination.current=null;
        if(hash===null)return;
        // Let navigation retain focus instead of returning to the Menu trigger.
        event.preventDefault();
        const target=hash?document.getElementById(hash):null;
        if(target){target.scrollIntoView({block:'start'});target.focus({preventScroll:true});}
      }}>
        <SheetHeader className="text-left"><SheetTitle>Menu</SheetTitle><SheetDescription>Find your teaching tools and account settings.</SheetDescription></SheetHeader>
        <nav aria-label="Mobile navigation" className="mt-5 space-y-5">
          <div className="flex flex-col gap-1">{primaryLinks(true)}</div>
          {isAuthenticated ? <>
            {beta?.owner && <div className="border-t pt-4">
              <Button variant="ghost" size="sm" className="w-full justify-start py-5" asChild><Link to="/beta-management" hash="overview" activeProps={activeProps} onClick={closeAfterNavigation}><ShieldCheck className="size-4"/>Management</Link></Button>
            </div>}
            <section aria-labelledby="mobile-account" className="space-y-1 border-t pt-4">
              <h2 id="mobile-account" className="mb-2 flex items-center gap-2 px-3 text-sm font-semibold text-muted-foreground"><UserRound className="size-4"/>Account</h2>
              <Button variant="ghost" size="sm" className="w-full justify-start py-5" asChild><Link to="/profile" activeProps={activeProps} onClick={closeAfterNavigation}>My profile</Link></Button>
              <Button variant="ghost" size="sm" className="w-full justify-start py-5" asChild><Link to="/auth" search={{password:true}} onClick={closeAfterNavigation}>Set/change password</Link></Button>
              <Button variant="ghost" size="sm" className="w-full justify-start py-5" disabled={signingOut} onClick={()=>void signOut()}><LogOut className="size-4"/>{signingOut?'Signing out…':'Sign out'}</Button>
            </section>
          </> : <Button className="w-full" variant="outline" asChild><Link to="/auth" onClick={closeAfterNavigation}>Sign in</Link></Button>}
        </nav>
      </SheetContent>
    </Sheet>
  </>;
}
