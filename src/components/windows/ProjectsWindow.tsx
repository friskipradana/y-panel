import type { ProjectsWindowProps } from './projects/useProjectsWindow'
import { useProjectsWindow } from './projects/useProjectsWindow'
import { StaticUploadOverlay } from './projects/StaticUploadOverlay'
import { UploadDraftModal } from './projects/UploadDraftModal'
import { ProjectsToolbar } from './projects/ProjectsToolbar'
import { ProjectFormModal } from './projects/ProjectFormModal'
import { ProjectsBody } from './projects/ProjectsBody'
import { ProjectLogModal } from './projects/ProjectLogModal'
import { RouteDomainModal } from './tunnels/RouteDomainModal'
import { projectSubject } from './projects/projectsConfig'

export default function ProjectsWindow({ win }: ProjectsWindowProps) {
  const pw = useProjectsWindow({ win })

  return (
    <div className="panel-window docker-window-root relative overflow-hidden">
      <StaticUploadOverlay pw={pw} />
      <UploadDraftModal pw={pw} />
      <ProjectsToolbar pw={pw} />
      <ProjectFormModal pw={pw} />
      <ProjectsBody pw={pw} />
      <ProjectLogModal pw={pw} />
      <RouteDomainModal subject={pw.domainProject ? projectSubject(pw.domainProject) : null} onClose={() => pw.setDomainProject(null)} />
    </div>
  )
}
