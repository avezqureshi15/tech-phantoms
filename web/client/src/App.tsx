import { Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import Demo from "@/pages/Demo";
import Console from "@/pages/Console";
import TicketDetail from "@/pages/TicketDetail";
import { ConsoleLayout } from "@/components/console/ConsoleLayout";
import Queries from "@/pages/Queries";
import CallDetail from "@/pages/CallDetail";
import QueryDetail from "@/pages/QueryDetail";
import Knowledge from "@/pages/Knowledge";
import SignIn from "@/pages/SignIn";
import AcceptInvite from "@/pages/AcceptInvite";
import WorkspacePicker from "@/pages/WorkspacePicker";
import Members from "@/pages/Members";
import Platform from "@/pages/Platform";
import { RequireAuth, RequirePlatform } from "@/auth/guards";

export default function App() {
  return (
    <div className="flex min-h-svh w-full flex-col bg-background">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/accept-invite/:token" element={<AcceptInvite />} />
        <Route path="/select-workspace" element={<RequireAuth><WorkspacePicker /></RequireAuth>} />
        <Route path="/demo" element={<RequireAuth><Demo /></RequireAuth>} />

        <Route element={<RequireAuth><ConsoleLayout /></RequireAuth>}>
          <Route path="/console" element={<Console />} />
          <Route path="/console/tickets/:id" element={<TicketDetail />} />
          <Route path="/queries" element={<Queries />} />
          <Route path="/queries/:id" element={<QueryDetail />} />
          <Route path="/calls/:id" element={<CallDetail />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/settings/members" element={<Members />} />
        </Route>

        <Route path="/platform/tenants" element={<RequirePlatform><Platform /></RequirePlatform>} />
      </Routes>
      <Toaster />
    </div>
  );
}
