import type { ProjectsWindowProps } from './projects/useProjectsWindow'
import { useProjectsWindow } from './projects/useProjectsWindow'
import { StaticUploadOverlay } from './projects/StaticUploadOverlay'
import { UploadDraftModal } from './projects/UploadDraftModal'
import { ProjectsToolbar } from './projects/ProjectsToolbar'
import { ProjectFormModal } from './projects/ProjectFormModal'
import { ProjectsBody } from './projects/ProjectsBody'

export default function ProjectsWindow({ win }: ProjectsWindowProps) {
  const pw = useProjectsWindow({ win })

  return (
    <div className="panel-window relative overflow-hidden">
      <StaticUploadOverlay pw={pw} />
      <UploadDraftModal pw={pw} />
      <ProjectsToolbar pw={pw} />
      <ProjectFormModal pw={pw} />
      <ProjectsBody pw={pw} />
    </div>
  )
}
