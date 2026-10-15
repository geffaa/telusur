"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/hooks/use-me";
import { canManage } from "@/lib/api";

/** Admins land on the knowledge-base overview, everyone else on chat. */
export default function Home() {
  const router = useRouter();
  const { data: me } = useMe();
  useEffect(() => {
    if (me) router.replace(canManage(me.role) ? "/overview" : "/chat");
  }, [me, router]);
  return null;
}
