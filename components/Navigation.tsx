"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/products", label: "Products" },
  { href: "/orders", label: "Orders" },
  { href: "/settings", label: "Settings" },
];

export default function Navigation() {
  const pathname = usePathname() || "/";
  return (
    <nav className="navbar">
      <Link href="/" className="brand" aria-label="Merchant home">
        <Image
          src="/logo.png"
          alt="Merchant"
          width={360}
          height={80}
          priority
          sizes="(max-width: 720px) 140px, 200px"
          className="brand-logo"
        />
      </Link>
      <div className="links">
        {LINKS.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "active" : ""}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
