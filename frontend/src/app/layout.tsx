import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PHÒNG KIỂM NGHIỆM MỸ PHẨM",
  description: "Ứng dụng AI trong kiểm nghiệm mỹ phẩm",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
