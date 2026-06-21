import Navbar from "./Navbar";
import Footer from "./Footer";
import AdsterraNativeBanner from "./AdsterraNativeBanner";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper-50">
      <Navbar />
      <div className="flex-1">{children}</div>
      <AdsterraNativeBanner />
      <Footer />
    </div>
  );
}
