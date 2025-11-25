"use client";

import Wrapper from "@/components/Wrapper";
import React from "react";
import Link from "next/link";
import BackBtn from "@/components/BackBtn";
import { usePathname } from "next/navigation";
import HeaderNav from "@/app/(presentation-generator)/components/HeaderNab";
import { Layout, FilePlus2 } from "lucide-react";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
const Header = () => {
  const pathname = usePathname();
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 w-full shadow-xl sticky top-0 z-50">
      <Wrapper>
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-4">
            {(pathname !== "/upload" && pathname !== "/dashboard") && <BackBtn />}
            <Link href="/dashboard" onClick={() => trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/dashboard" })} className="flex items-center gap-3 group">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 backdrop-blur-sm transition-all group-hover:bg-white/20">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                <span className="text-white font-bold text-lg tracking-tight">Presentation Agent</span>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/custom-template"
              prefetch={false}
              onClick={() => trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/custom-template" })}
              className="flex items-center gap-2 px-4 py-2 text-white/90 hover:bg-white/10 hover:text-white rounded-lg transition-all outline-none"
              role="menuitem"
            >
              <FilePlus2 className="w-5 h-5" />
              <span className="text-sm font-medium font-inter">Create Template</span>
            </Link>
            <Link
              href="/template-preview"
              prefetch={false}
              onClick={() => trackEvent(MixpanelEvent.Navigation, { from: pathname, to: "/template-preview" })}
              className="flex items-center gap-2 px-4 py-2 text-white/90 hover:bg-white/10 hover:text-white rounded-lg transition-all outline-none"
              role="menuitem"
            >
              <Layout className="w-5 h-5" />
              <span className="text-sm font-medium font-inter">Templates</span>
            </Link>
            <HeaderNav />
          </div>
        </div>
      </Wrapper>
    </div>
  );
};

export default Header;
