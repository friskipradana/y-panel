import axios from 'axios'

// Semua request ke Portainer lewat /portainer (di-proxy oleh Vite dev server)
// Saat production, Nginx yang handle proxy-nya
export const portainerApi = axios.create({
  baseURL: '/portainer/api',
  headers: { 'Content-Type': 'application/json' },
})

// Inject JWT token otomatis di setiap request
portainerApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('portainer_jwt')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Auth ──────────────────────────────────────────────────────────
export async function portainerLogin(username: string, password: string) {
  const res = await portainerApi.post('/auth', { username, password })
  const jwt = res.data.jwt as string
  localStorage.setItem('portainer_jwt', jwt)
  return jwt
}

// ── Containers ───────────────────────────────────────────────────
// endpointId: biasanya 1 untuk local Docker
export const getContainers = (endpointId = 1) =>
  portainerApi
    .get(`/endpoints/${endpointId}/docker/containers/json?all=true`)
    .then((r) => r.data)

export const getContainerStats = (endpointId = 1, containerId: string) =>
  portainerApi
    .get(`/endpoints/${endpointId}/docker/containers/${containerId}/stats?stream=false`)
    .then((r) => r.data)

export const startContainer = (endpointId = 1, containerId: string) =>
  portainerApi.post(`/endpoints/${endpointId}/docker/containers/${containerId}/start`)

export const stopContainer = (endpointId = 1, containerId: string) =>
  portainerApi.post(`/endpoints/${endpointId}/docker/containers/${containerId}/stop`)
