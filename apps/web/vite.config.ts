import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

function marbeeApiPlugin(): Plugin {
  const dataDir = path.resolve(process.cwd(), './.marbee_data');
  if (!fs.existsSync(dataDir)) {
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  }
  const pushSubsFile = path.join(dataDir, 'push_subscribers.json');
  const eventsFile = path.join(dataDir, 'analytics_events.json');

  const readJson = (file: string) => {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {}
    return [];
  };

  const writeJson = (file: string, data: unknown) => {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
  };

  return {
    name: 'marbee-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Enable CORS for all incoming API requests from external websites
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-tenant-id');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        const pathname = (req.url || '').split('?')[0];

        // Endpoint: POST /api/v1/web-push/subscribe
        if (pathname === '/api/v1/web-push/subscribe' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const current = readJson(pushSubsFile);
              const ua = data.browser || req.headers['user-agent'] || '';
              const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
              const isTablet = /iPad|Tablet/i.test(ua);
              const browser = /Edg/i.test(ua) ? 'Edge' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) && !/Chrome/i.test(ua) ? 'Safari' : 'Chrome';
              const os = /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : /Android/i.test(ua) ? 'Android' : /iOS/i.test(ua) ? 'iOS' : 'Desktop';
              const device = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

              const subscriber = {
                id: `wps_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                tenantId: data.tenant_id || '00000000-0000-0000-0000-000000000001',
                environment: data.environment || 'production',
                siteId: data.site_id || 'site_k6anf9',
                websiteDomain: data.website_domain || (req.headers.referer ? new URL(req.headers.referer).hostname : 'remote-website'),
                optinPage: data.optin_page || '/',
                optinStatus: data.optin_status || 'yes',
                fcmToken: data.fcm_token || `token_${Date.now()}`,
                customerId: data.customer_id || null,
                browser,
                os,
                device,
                permissionStatus: data.permission_status || 'granted',
                subscriptionStatus: 'active',
                isTestToken: Boolean(data.is_test_token || data.fcm_token?.startsWith('TEST_TOKEN_')),
                endpoint: data.endpoint,
                lastSeen: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              };

              // Merge or insert
              const existingIdx = current.findIndex((s: { fcmToken: string }) => s.fcmToken === subscriber.fcmToken);
              if (existingIdx >= 0) {
                current[existingIdx] = { ...current[existingIdx], ...subscriber };
              } else {
                current.unshift(subscriber);
              }
              writeJson(pushSubsFile, current);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, subscriber }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // Endpoint: GET /api/v1/web-push/subscribers
        if (pathname === '/api/v1/web-push/subscribers' && req.method === 'GET') {
          const list = readJson(pushSubsFile);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, subscribers: list }));
          return;
        }

        // Endpoint: POST /api/v1/web-push/subscribers/delete or DELETE /api/v1/web-push/subscribers/:id
        if (
          (pathname === '/api/v1/web-push/subscribers/delete' && req.method === 'POST') ||
          (pathname.startsWith('/api/v1/web-push/subscribers') && req.method === 'DELETE')
        ) {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              let targetId = '';
              if (body) {
                try {
                  const parsed = JSON.parse(body);
                  targetId = parsed.id || parsed.fcmToken || '';
                } catch {}
              }
              if (!targetId) {
                const parts = pathname.split('/');
                targetId = decodeURIComponent(parts[parts.length - 1] || '');
              }
              const list = readJson(pushSubsFile);
              const filtered = list.filter(
                (s: { id: string; fcmToken: string }) => s.id !== targetId && s.fcmToken !== targetId
              );
              writeJson(pushSubsFile, filtered);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, remaining: filtered.length }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // Endpoint: POST /api/v1/web-push/subscribers/update-status
        if (pathname === '/api/v1/web-push/subscribers/update-status' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const list = readJson(pushSubsFile);
              const idx = list.findIndex(
                (s: { id: string; fcmToken: string }) =>
                  s.id === data.id || s.fcmToken === data.fcmToken || s.fcmToken === data.fcmTokenOrId
              );
              if (idx >= 0) {
                list[idx] = {
                  ...list[idx],
                  subscriptionStatus: data.subscriptionStatus || (data.delivered ? 'active' : 'inactive'),
                  lastDeliveryStatus: data.delivered ? 'delivered' : 'failed',
                  lastFailureReason: data.delivered ? null : (data.failureReason || 'Push delivery failed — endpoint unreachable'),
                  lastSeen: new Date().toISOString(),
                };
                writeJson(pushSubsFile, list);
              }
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // Endpoint: POST /api/v1/web-push/subscribers/clear-test
        if (pathname === '/api/v1/web-push/subscribers/clear-test' && req.method === 'POST') {
          const list = readJson(pushSubsFile);
          const filtered = list.filter(
            (s: { isTestToken?: boolean; fcmToken?: string }) =>
              !s.isTestToken &&
              !s.fcmToken?.startsWith('TEST_TOKEN_') &&
              !s.fcmToken?.startsWith('fcm_sim_') &&
              !s.fcmToken?.startsWith('live_netlify_') &&
              !s.fcmToken?.startsWith('mb_push_') &&
              !s.fcmToken?.startsWith('mb_tok_')
          );
          writeJson(pushSubsFile, filtered);

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, count: filtered.length }));
          return;
        }

        // Endpoint: POST /api/v1/web-analytics/collect
        if (pathname === '/api/v1/web-analytics/collect' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const events = Array.isArray(data.events) ? data.events : [data];
              const current = readJson(eventsFile);
              const updated = [...events, ...current].slice(0, 1000);
              writeJson(eventsFile, updated);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, received: events.length }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // ==========================================
        // MULTI-TENANT TASKS API ENDPOINTS
        // ==========================================
        const tasksFile = path.resolve(dataDir, 'tasks.json');

        // GET /api/v1/tasks
        if (pathname === '/api/v1/tasks' && req.method === 'GET') {
          const urlObj = new URL(req.url || '', 'http://localhost');
          const tenantId = urlObj.searchParams.get('tenantId') || '00000000-0000-0000-0000-000000000001';
          const environment = urlObj.searchParams.get('environment') || 'production';
          const allTasks = readJson(tasksFile);
          const tenantTasks = allTasks.filter((t: any) => (!t.tenantId || t.tenantId === tenantId) && (!t.environment || t.environment === environment));
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, tasks: tenantTasks }));
          return;
        }

        // POST /api/v1/tasks (Create or Update)
        if (pathname === '/api/v1/tasks' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const allTasks = readJson(tasksFile);
              const task = {
                id: data.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                tenantId: data.tenantId || '00000000-0000-0000-0000-000000000001',
                environment: data.environment || 'production',
                title: data.title || 'Untitled Task',
                description: data.description || '',
                priority: data.priority || 'medium',
                status: data.status || 'todo',
                module: data.module || 'General',
                assignee: data.assignee || 'Unassigned',
                dueDate: data.dueDate || new Date().toISOString().split('T')[0],
                subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              const existingIdx = allTasks.findIndex((t: any) => t.id === task.id);
              if (existingIdx >= 0) {
                allTasks[existingIdx] = { ...allTasks[existingIdx], ...task };
              } else {
                allTasks.unshift(task);
              }
              writeJson(tasksFile, allTasks);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, task }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // POST /api/v1/tasks/delete or DELETE /api/v1/tasks/:id
        if (
          (pathname === '/api/v1/tasks/delete' && req.method === 'POST') ||
          (pathname.startsWith('/api/v1/tasks') && req.method === 'DELETE')
        ) {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              let targetId = '';
              if (req.method === 'DELETE') {
                targetId = pathname.replace('/api/v1/tasks/', '').replace('/api/v1/tasks', '').trim();
              }
              if (!targetId && body) {
                const parsed = JSON.parse(body);
                targetId = parsed.id || parsed.taskId || '';
              }
              const allTasks = readJson(tasksFile);
              const updated = allTasks.filter((t: any) => t.id !== targetId);
              writeJson(tasksFile, updated);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, deletedId: targetId }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // ==========================================
        // MULTI-TENANT NOTIFICATIONS API ENDPOINTS
        // ==========================================
        const notifsFile = path.resolve(dataDir, 'notifications.json');

        // GET /api/v1/notifications
        if (pathname === '/api/v1/notifications' && req.method === 'GET') {
          const urlObj = new URL(req.url || '', 'http://localhost');
          const tenantId = urlObj.searchParams.get('tenantId') || '00000000-0000-0000-0000-000000000001';
          const environment = urlObj.searchParams.get('environment') || 'production';
          const allNotifs = readJson(notifsFile);
          const tenantNotifs = allNotifs.filter((n: any) => (!n.tenantId || n.tenantId === tenantId) && (!n.environment || n.environment === environment));
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, notifications: tenantNotifs }));
          return;
        }

        // POST /api/v1/notifications (Create notification)
        if (pathname === '/api/v1/notifications' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const allNotifs = readJson(notifsFile);
              const notification = {
                id: data.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                tenantId: data.tenantId || '00000000-0000-0000-0000-000000000001',
                environment: data.environment || 'production',
                title: data.title || 'System Notification',
                message: data.message || '',
                category: data.category || 'system',
                timestamp: data.timestamp || new Date().toISOString(),
                read: Boolean(data.read),
                actionUrl: data.actionUrl || null,
                actionLabel: data.actionLabel || null,
                badge: data.badge || null,
              };

              allNotifs.unshift(notification);
              writeJson(notifsFile, allNotifs.slice(0, 500));

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, notification }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // POST /api/v1/notifications/mark-read
        if (pathname === '/api/v1/notifications/mark-read' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const targetId = data.id || data.notificationId;
              const allNotifs = readJson(notifsFile);
              const updated = allNotifs.map((n: any) => n.id === targetId ? { ...n, read: true } : n);
              writeJson(notifsFile, updated);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // POST /api/v1/notifications/mark-all-read
        if (pathname === '/api/v1/notifications/mark-all-read' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const tenantId = data.tenantId;
              const environment = data.environment;
              const allNotifs = readJson(notifsFile);
              const updated = allNotifs.map((n: any) => {
                if ((!tenantId || n.tenantId === tenantId) && (!environment || n.environment === environment)) {
                  return { ...n, read: true };
                }
                return n;
              });
              writeJson(notifsFile, updated);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // POST /api/v1/notifications/delete
        if (pathname === '/api/v1/notifications/delete' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const targetId = data.id || data.notificationId;
              const allNotifs = readJson(notifsFile);
              const updated = allNotifs.filter((n: any) => n.id !== targetId);
              writeJson(notifsFile, updated);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        // POST /api/v1/notifications/clear
        if (pathname === '/api/v1/notifications/clear' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const tenantId = data.tenantId;
              const environment = data.environment;
              const allNotifs = readJson(notifsFile);
              const updated = allNotifs.filter((n: any) => (tenantId && n.tenantId !== tenantId) || (environment && n.environment !== environment));
              writeJson(notifsFile, updated);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // AI providers are reached only through the ai-gateway / *-ai edge functions (SEC-06):
  // no OpenAI dev proxy, and no AI keys in VITE_* variables (those are inlined into the bundle).
  void loadEnv(mode, process.cwd(), '');

  return {
    plugins: [marbeeApiPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), './src'),
        '@marbee/shared': path.resolve(process.cwd(), '../../packages/shared/src'),
      },
    },
    server: {
      host: true,
      watch: {
        ignored: [
          '**/.marbee_data/**',
          '**/.marbee_data/*',
          '**/push_subscribers.json',
          '**/analytics_events.json',
          '**/tasks.json',
          '**/notifications.json',
        ],
      },
      proxy: {
        '/mailjet-api': {
          target: 'https://api.mailjet.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/mailjet-api/, ''),
        },
        '/resend-api': {
          target: 'https://api.resend.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/resend-api/, ''),
        },
        '/jev-api': {
          target: 'https://jevtypesafeai.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/jev-api/, '/api'),
        },
      },
    },
  };
});
