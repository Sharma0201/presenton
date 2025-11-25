"use client";

import React from "react";
import Link from "next/link";
import { Layout, Plus } from "lucide-react";

const Header: React.FC = () => {
  return (
    <header className="w-full border-b bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md transition-all group-hover:shadow-lg group-hover:from-blue-700 group-hover:to-indigo-700">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              <span className="text-white font-bold text-lg tracking-tight">Presentation Agent</span>
            </div>
          </Link>

          <nav className="flex items-center gap-4">
            <Link href="/custom-layout" className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900">
              <Plus className="w-5 h-5" />
              <span className="text-sm font-medium font-inter">Create Template</span>
            </Link>
            <Link href="/template-preview" className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900">
              <Layout className="w-5 h-5" />
              <span className="text-sm font-medium font-inter">Templates</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
