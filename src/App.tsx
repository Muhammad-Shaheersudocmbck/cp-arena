import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedLayout from "@/components/ProtectedLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import MatchmakingPage from "@/pages/MatchmakingPage";
import MatchPage from "@/pages/MatchPage";
import LeaderboardPage from "@/pages/LeaderboardPage";
import ProfilePage from "@/pages/ProfilePage";
import AdminPage from "@/pages/AdminPage";
import FriendsPage from "@/pages/FriendsPage";
import MessagesPage from "@/pages/MessagesPage";
import ChallengePage from "@/pages/ChallengePage";
import BlogsPage from "@/pages/BlogsPage";
import ContestsPage from "@/pages/ContestsPage";
import ContestDetailPage from "@/pages/ContestDetailPage";
import AnnouncementsPage from "@/pages/AnnouncementsPage";
import SupportPage from "@/pages/SupportPage";

import NotificationsPage from "@/pages/NotificationsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/matchmaking" element={<MatchmakingPage />} />
              <Route path="/match/:matchId" element={<MatchPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/profile/:id" element={<ProfilePage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route path="/messages/:recipientId" element={<MessagesPage />} />
              <Route path="/challenge/:challengeCode" element={<ChallengePage />} />
              <Route path="/contests" element={<ContestsPage />} />
              <Route path="/contests/:contestId" element={<ContestDetailPage />} />
              <Route path="/blogs" element={<BlogsPage />} />
              <Route path="/announcements" element={<AnnouncementsPage />} />
              <Route path="/support" element={<SupportPage />} />
              
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
