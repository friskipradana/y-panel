import axios from 'axios'

const runtimeApi = axios.create({
  baseURL: import.meta.env.VITE_AGENT_API_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

export const getContainers = () => runtimeApi.get('/containers').then((r) => r.data)

export const startContainer = (containerId: string) =>
  runtimeApi.post(`/containers/${containerId}/start`).then((r) => r.data)

export const stopContainer = (containerId: string) =>
  runtimeApi.post(`/containers/${containerId}/stop`).then((r) => r.data)
