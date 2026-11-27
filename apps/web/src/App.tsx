import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { LoginPage } from '@/pages/LoginPage';
import { WorkspaceUnavailablePage } from '@/pages/WorkspaceUnavailablePage';
import { LandingPage } from '@/pages/LandingPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { CommandCenterPage } from '@/pages/CommandCenterPage';
import { LoyaltyPage } from '@/pages/LoyaltyPage';
import { OffersPage } from '@/pages/OffersPage';
import { CouponsPage } from '@/pages/CouponsPage';
import { DecisionStudioPage } from '@/pages/DecisionStudioPage';
import { InsightsPage } from '@/pages/InsightsPage';
import { AiAssistantPage } from '@/pages/AiAssistantPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { CustomerDetailPage } from '@/pages/CustomerDetailPage';
import { AudiencePage } from '@/pages/AudiencePage';
import { AudienceDetailPage } from '@/pages/AudienceDetailPage';
import { JourneysPage, JourneyEditorPage } from '@/pages/JourneysPage';
import { CampaignsPage } from '@/pages/CampaignsPage';
import { WebPushCampaignsPage, WebPushCampaignReportPage } from '@/pages/campaigns/WebPushCampaignsPage';
import { CampaignWizardPage } from '@/pages/campaigns/CampaignWizardPage';
import { CampaignDashboardPage } from '@/pages/campaigns/CampaignDashboardPage';
import { SchemasPage } from '@/pages/SchemasPage';
import { SchemaDetailPage } from '@/pages/SchemaDetailPage';
import { SchemaRegistryPage } from '@/pages/SchemaRegistryPage';
import { RealTimePage } from '@/pages/RealTimePage';
import { ChannelsSettingsPage } from '@/pages/settings/ChannelsSettingsPage';
import { EmailDomainsPage } from '@/pages/settings/EmailDomainsPage';
import { GeneralSettingsPage } from '@/pages/settings/GeneralSettingsPage';
import { AiEngineSettingsPage } from '@/pages/settings/AiEngineSettingsPage';
import { AuditLogPage } from '@/pages/settings/AuditLogPage';
import { LicenseUsagePage } from '@/pages/settings/LicenseUsagePage';
import { AccessManagementPage } from '@/pages/settings/AccessManagementPage';
import { MyAccountPage } from '@/pages/settings/MyAccountPage';
import { MemberAccountPage } from '@/pages/settings/MemberAccountPage';
import { ApiSettingsPage } from '@/pages/settings/ApiSettingsPage';
import { SocialStudioPage } from '@/pages/content/SocialStudioPage';
import { AcceptInvitePage } from '@/pages/AcceptInvitePage';
import { SetupPasswordPage } from '@/pages/SetupPasswordPage';
import { AssetLibraryPage } from '@/pages/content/AssetLibraryPage';
import { FilesPage } from '@/pages/content/FilesPage';
import { FormsPage } from '@/pages/content/FormsPage';
import { FormDetailPage } from '@/pages/content/FormDetailPage';
import { PublicFormPage } from '@/pages/content/PublicFormPage';
import { LandingPagesPage } from '@/pages/content/LandingPagesPage';
import { LandingPageDetailPage } from '@/pages/content/LandingPageDetailPage';
import { PublicLandingPage } from '@/pages/content/PublicLandingPage';
import { PublicChatPage } from '@/pages/PublicChatPage';
import { TemplatesPage } from '@/pages/content/TemplatesPage';
import { TemplateDetailPage } from '@/pages/content/TemplateDetailPage';
import { ChatBotsPage } from '@/pages/content/ChatBotsPage';
import { ChatBotStudioPage } from '@/pages/content/ChatBotStudioPage';
import { PublicChatBotPage } from '@/pages/content/PublicChatBotPage';
import { EventsPage } from '@/pages/EventsPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { SubscriptionsPage } from '@/pages/SubscriptionsPage';
import { SubscriptionDetailPage } from '@/pages/SubscriptionDetailPage';
import { DataOverviewPage } from '@/pages/DataOverviewPage';
import { JobCenterPage } from '@/pages/JobCenterPage';
import { RunDetailPage } from '@/pages/RunDetailPage';
import { SchedulesPage } from '@/pages/SchedulesPage';
import { LineagePage } from '@/pages/LineagePage';
import { SyncMonitorPage } from '@/pages/SyncMonitorPage';
import { ConnectorsPage } from '@/pages/ConnectorsPage';
import { ConnectorMarketplacePage } from '@/pages/ConnectorMarketplacePage';
import { AddConnectorWizardPage } from '@/pages/AddConnectorWizardPage';
import { ConnectorDetailPage } from '@/pages/ConnectorDetailPage';
import { DataJobsPage } from '@/pages/DataJobsPage';
import { DataJobDetailPage } from '@/pages/DataJobDetailPage';
import { DataQualityPage } from '@/pages/DataQualityPage';
import { PushOpenPage } from '@/pages/PushOpenPage';
import { WebAnalyticsPage } from '@/pages/WebAnalyticsPage';
import { DevEmailStudioPage } from '@/pages/dev/DevEmailStudioPage';
import { DevAssetLibraryPage } from '@/pages/dev/DevAssetLibraryPage';
import { DevFormStudioPage } from '@/pages/dev/DevFormStudioPage';
import { DevSocialStudioPage } from '@/pages/dev/DevSocialStudioPage';
import { DevChannelStudioPage } from '@/pages/dev/DevChannelStudioPage';
import { DevJourneyStudioPage } from '@/pages/dev/DevJourneyStudioPage';
import { DevLandingStudioPage } from '@/pages/dev/DevLandingStudioPage';
import { DevCohortStudioPage } from '@/pages/dev/DevCohortStudioPage';
import { DevFilesPage } from '@/pages/dev/DevFilesPage';
import { DevPipelinesPage } from '@/pages/dev/DevPipelinesPage';
import { DevDecisionStudioPage } from '@/pages/dev/DevDecisionStudioPage';
import { DevEmailDomainsPage } from '@/pages/dev/DevEmailDomainsPage';
import { DevCampaignDashboardPage } from '@/pages/dev/DevCampaignDashboardPage';
import { DevWorkspaceUnavailablePage } from '@/pages/dev/DevWorkspaceUnavailablePage';
import AutomationsPage from '@/pages/data/AutomationsPage';
import AutomationEditorPage from '@/pages/data/AutomationEditorPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, workspaceStatus } = useAuth();

  if (loading || (session && workspaceStatus === 'loading')) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  // TD-20: no active workspace → explain, never show an empty app for a fallback workspace.
  if (workspaceStatus === 'none' || workspaceStatus === 'suspended') return <WorkspaceUnavailablePage />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/setup-password" element={<SetupPasswordPage />} />
      <Route path="/forms/:slug" element={<PublicFormPage />} />
      <Route path="/pages/:slug" element={<PublicLandingPage />} />
      <Route path="/chat/:jobId/:nodeId" element={<PublicChatPage />} />
      <Route path="/b/:slug" element={<PublicChatBotPage />} />
      <Route path="/embed/:slug" element={<PublicChatBotPage embed />} />
      <Route path="/push/open" element={<PushOpenPage />} />
      {import.meta.env.DEV && (
        <Route path="/dev/campaign-dashboard" element={<DevCampaignDashboardPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/workspace-unavailable" element={<DevWorkspaceUnavailablePage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/email-studio" element={<DevEmailStudioPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/email-domains" element={<DevEmailDomainsPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/social-studio" element={<DevSocialStudioPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/channel-studio" element={<DevChannelStudioPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/journey-studio" element={<DevJourneyStudioPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/landing-studio" element={<DevLandingStudioPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/asset-library" element={<DevAssetLibraryPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/form-studio" element={<DevFormStudioPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/cohort-studio" element={<DevCohortStudioPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/files" element={<DevFilesPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/pipelines" element={<DevPipelinesPage />} />
      )}
      {import.meta.env.DEV && (
        <Route path="/dev/decision-studio" element={<DevDecisionStudioPage />} />
      )}
      <Route path="/" element={<LandingPage />} />
      <Route path="/loyalty" element={<ProtectedRoute><LoyaltyPage /></ProtectedRoute>} />
      <Route path="/loyalty/offers" element={<ProtectedRoute><OffersPage /></ProtectedRoute>} />
      <Route path="/loyalty/coupons" element={<ProtectedRoute><CouponsPage /></ProtectedRoute>} />
      <Route path="/loyalty/decision-engine" element={<ProtectedRoute><DecisionStudioPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><CommandCenterPage /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
      <Route path="/insights" element={<ProtectedRoute><InsightsPage /></ProtectedRoute>} />
      <Route path="/ai-assistant" element={<ProtectedRoute><AiAssistantPage /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
      <Route path="/customers/audiences" element={<ProtectedRoute><AudiencePage /></ProtectedRoute>} />
      <Route path="/customers/audiences/:id" element={<ProtectedRoute><AudienceDetailPage /></ProtectedRoute>} />
      <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetailPage /></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
      <Route path="/subscriptions" element={<ProtectedRoute><SubscriptionsPage /></ProtectedRoute>} />
      <Route path="/subscriptions/:id" element={<ProtectedRoute><SubscriptionDetailPage /></ProtectedRoute>} />
      <Route path="/campaigns" element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
      <Route path="/campaigns/new" element={<ProtectedRoute><CampaignWizardPage /></ProtectedRoute>} />
      <Route path="/campaigns/web-push" element={<ProtectedRoute><WebPushCampaignsPage /></ProtectedRoute>} />
      <Route path="/campaigns/web-push/:id" element={<ProtectedRoute><WebPushCampaignReportPage /></ProtectedRoute>} />
      <Route path="/campaigns/:id" element={<ProtectedRoute><CampaignDashboardPage /></ProtectedRoute>} />
      <Route path="/campaigns/:id/legacy" element={<ProtectedRoute><JourneyEditorPage /></ProtectedRoute>} />
      <Route path="/journeys" element={<ProtectedRoute><JourneysPage /></ProtectedRoute>} />
      <Route path="/journeys/:id" element={<ProtectedRoute><JourneyEditorPage /></ProtectedRoute>} />
      <Route path="/real-time" element={<ProtectedRoute><RealTimePage /></ProtectedRoute>} />
      <Route path="/real-time/templates" element={<ProtectedRoute><RealTimePage /></ProtectedRoute>} />
      <Route path="/real-time/events" element={<ProtectedRoute><RealTimePage /></ProtectedRoute>} />
      <Route path="/real-time/deliveries" element={<ProtectedRoute><RealTimePage /></ProtectedRoute>} />
      <Route path="/real-time/triggers" element={<ProtectedRoute><RealTimePage /></ProtectedRoute>} />
      <Route path="/real-time/settings" element={<ProtectedRoute><RealTimePage /></ProtectedRoute>} />
      <Route path="/triggers" element={<Navigate to="/real-time/triggers" replace />} />
      <Route path="/journey-analytics" element={<ProtectedRoute><PlaceholderPage title="Journey Analytics" /></ProtectedRoute>} />
      <Route path="/content/assets" element={<ProtectedRoute><AssetLibraryPage /></ProtectedRoute>} />
      <Route path="/content/files" element={<ProtectedRoute><FilesPage /></ProtectedRoute>} />
      <Route path="/content/forms" element={<ProtectedRoute><FormsPage /></ProtectedRoute>} />
      <Route path="/content/forms/:id" element={<ProtectedRoute><FormDetailPage /></ProtectedRoute>} />
      <Route path="/content/landing-pages" element={<ProtectedRoute><LandingPagesPage /></ProtectedRoute>} />
      <Route path="/content/landing-pages/:id" element={<ProtectedRoute><LandingPageDetailPage /></ProtectedRoute>} />
      <Route path="/content/social" element={<ProtectedRoute><SocialStudioPage /></ProtectedRoute>} />
      <Route path="/content/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
      <Route path="/content/templates/:id" element={<ProtectedRoute><TemplateDetailPage /></ProtectedRoute>} />
      <Route path="/content/chatbots" element={<ProtectedRoute><ChatBotsPage /></ProtectedRoute>} />
      <Route path="/content/chatbots/:id" element={<ProtectedRoute><ChatBotStudioPage /></ProtectedRoute>} />
      <Route path="/content/*" element={<ProtectedRoute><PlaceholderPage title="Content" /></ProtectedRoute>} />
      <Route path="/data/overview" element={<ProtectedRoute><DataOverviewPage /></ProtectedRoute>} />
      <Route path="/data/schemas" element={<ProtectedRoute><SchemasPage /></ProtectedRoute>} />
      <Route path="/data/schemas/registry" element={<ProtectedRoute><SchemaRegistryPage /></ProtectedRoute>} />
      <Route path="/data/schemas/:slug" element={<ProtectedRoute><SchemaDetailPage /></ProtectedRoute>} />
      <Route path="/data/explorer" element={<Navigate to="/data/schemas?tab=explorer" replace />} />
      <Route path="/data/connectors" element={<ProtectedRoute><ConnectorsPage /></ProtectedRoute>} />
      <Route path="/data/connectors/marketplace" element={<ProtectedRoute><ConnectorMarketplacePage /></ProtectedRoute>} />
      <Route path="/data/connectors/new" element={<ProtectedRoute><AddConnectorWizardPage /></ProtectedRoute>} />
      <Route path="/data/connectors/:id" element={<ProtectedRoute><ConnectorDetailPage /></ProtectedRoute>} />
      <Route path="/data/connectors/:id/monitor" element={<ProtectedRoute><SyncMonitorPage /></ProtectedRoute>} />
      <Route path="/data/runs" element={<ProtectedRoute><JobCenterPage /></ProtectedRoute>} />
      <Route path="/data/runs/:runId" element={<ProtectedRoute><RunDetailPage /></ProtectedRoute>} />
      <Route path="/data/jobs" element={<ProtectedRoute><DataJobsPage /></ProtectedRoute>} />
      <Route path="/data/jobs/:id" element={<ProtectedRoute><DataJobDetailPage /></ProtectedRoute>} />
      <Route path="/data/automations" element={<ProtectedRoute><AutomationsPage /></ProtectedRoute>} />
      <Route path="/data/automations/:id" element={<ProtectedRoute><AutomationEditorPage /></ProtectedRoute>} />
      <Route path="/data/schedules" element={<ProtectedRoute><SchedulesPage /></ProtectedRoute>} />
      <Route path="/data/lineage" element={<ProtectedRoute><LineagePage /></ProtectedRoute>} />
      <Route path="/data/quality" element={<ProtectedRoute><DataQualityPage /></ProtectedRoute>} />
      <Route path="/data/*" element={<ProtectedRoute><PlaceholderPage title="Data Platform" /></ProtectedRoute>} />
      <Route path="/reporting/web-analytics" element={<ProtectedRoute><WebAnalyticsPage /></ProtectedRoute>} />
      <Route path="/reporting/*" element={<ProtectedRoute><PlaceholderPage title="Reporting" /></ProtectedRoute>} />
      <Route path="/settings/general" element={<ProtectedRoute><GeneralSettingsPage /></ProtectedRoute>} />
      <Route path="/settings/ai-engine" element={<ProtectedRoute><AiEngineSettingsPage /></ProtectedRoute>} />
      <Route path="/settings/account" element={<ProtectedRoute><MyAccountPage /></ProtectedRoute>} />
      <Route path="/settings/channels" element={<ProtectedRoute><ChannelsSettingsPage /></ProtectedRoute>} />
      <Route path="/settings/email-domains" element={<ProtectedRoute><EmailDomainsPage /></ProtectedRoute>} />
      <Route path="/settings/social" element={<Navigate to="/settings/channels?tab=social" replace />} />
      <Route path="/settings/access" element={<ProtectedRoute><AccessManagementPage /></ProtectedRoute>} />
      <Route path="/settings/access/members/:userId" element={<ProtectedRoute><MemberAccountPage /></ProtectedRoute>} />
      <Route path="/settings/api" element={<ProtectedRoute><ApiSettingsPage /></ProtectedRoute>} />
      <Route path="/settings/api-keys" element={<ProtectedRoute><ApiSettingsPage /></ProtectedRoute>} />
      <Route path="/settings/audit-log" element={<ProtectedRoute><AuditLogPage /></ProtectedRoute>} />
      <Route path="/settings/usage" element={<ProtectedRoute><LicenseUsagePage /></ProtectedRoute>} />
      <Route path="/settings/*" element={<ProtectedRoute><PlaceholderPage title="Settings" /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
