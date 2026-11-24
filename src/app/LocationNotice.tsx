import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useToast } from "../components/toast-context";

/**
 * A toast handed over in the navigation state (`{ notice, noticeDetail? }`), for pages that send you
 * into the shell from outside it: an archived client's link, a client just added (Slice 17c). Shown once,
 * then cleared from history so Back / reload don't repeat it.
 */
export function LocationNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const state = location.state as { notice?: string; noticeDetail?: string } | null;
  const notice = state?.notice;
  const detail = state?.noticeDetail;
  useEffect(() => {
    if (!notice) return;
    toast.show({ title: notice, detail, pose: "idle" });
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    });
  }, [notice, detail, toast, navigate, location.pathname, location.search, location.hash]);
  return null;
}
