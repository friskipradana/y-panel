import { alertLib } from '@/lib/alert'
import { toast } from 'sonner'
import { Boxes, Plus, Box, Code, X, Check, ChevronDown, Pencil } from 'lucide-react'
import { EMPTY_ENV_ROW, toRawEnv, toEnvRows } from './constants'
import { DeployStep } from './DockerComponents'
import { DockerProgressOverlay } from './DockerProgressOverlay'
import type { DockerWindowState } from './useDockerWindow'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TextInput } from '@/components/ui/Field'
import { Tabs } from '@/components/ui/Tabs'
import { Checkbox } from '@/components/ui/Checkbox'

export function DeployModal({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    refetch,
    networksData,
    imagesData,
    templatesData,
    showDeploy,
    showSaveAsTpl,
    setShowSaveAsTpl,
    saveTemplateName,
    setSaveTemplateName,
    imgDropdownOpen,
    setImgDropdownOpen,
    imgInputValue,
    setImgInputValue,
    nameDropdownOpen,
    setNameDropdownOpen,
    netDropdownOpen,
    setNetDropdownOpen,
    netInputValue,
    setNetInputValue,
    imgComboRef,
    nameComboRef,
    netComboRef,
    editContainer,
    deployType,
    setDeployType,
    deployForm,
    setDeployForm,
    resetDeployModal,
    deployImageMut,
    deployComposeMut,
    createTemplateMut,
    deployReady,
  } = docker
  if (!showDeploy) return null

  return (
    <Modal
      open
      onClose={resetDeployModal}
      title={editContainer ? t('docker.editRedeploy') : t('docker.deployContainer')}
      icon={editContainer ? <Pencil /> : <Boxes />}
      size="xl"
      busyOverlay={
        (deployImageMut.isPending || deployComposeMut.isPending) && (
          <DockerProgressOverlay
            title={editContainer ? t('docker.editRedeploy') : t('docker.deployContainer')}
            subtitle={deployForm.name.trim() || (deployType === 'image' ? deployForm.image : 'docker-compose')}
            type="deploy"
          />
        )
      }
      footer={
        <>
            <Button variant="ghost" onClick={resetDeployModal}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary"
              disabled={!deployReady || deployImageMut.isPending || deployComposeMut.isPending}
              onClick={() => {
                if (deployType === 'image') {
                  deployImageMut.mutate(
                    {
                      name: deployForm.name.trim(),
                      replaceContainerId: editContainer?.id,
                      image: deployForm.image.trim(),
                      network: deployForm.network.trim() || undefined,
                      ports: deployForm.ports
                        .filter((p) => p.containerPort.trim())
                        .map((p) => ({
                          hostIp: '0.0.0.0',
                          hostPort: p.hostPort.trim(),
                          containerPort: p.containerPort.trim(),
                          protocol: 'tcp',
                        })),
                      env: deployForm.envMode === 'form'
                        ? deployForm.env.filter((e) => e.key.trim()).map((e) => ({ key: e.key.trim(), value: e.value }))
                        : toEnvRows(deployForm.envRaw).filter((e) => e.key.trim()),
                      volumes: deployForm.volumes
                        .filter((v) => v.containerPath.trim())
                        .map((v) => ({ hostPath: v.hostPath.trim(), containerPath: v.containerPath.trim() })),
                      registryAuth: deployForm.registryAuth.enabled
                        ? { enabled: true, registry: deployForm.registryAuth.registry || undefined, usernameOrEmail: deployForm.registryAuth.usernameOrEmail, password: deployForm.registryAuth.password }
                        : undefined,
                    },
                    {
                      onSuccess: () => {
                        toast.success(editContainer ? t('docker.containerRedeployed') : t('docker.containerDeployed'))
                        resetDeployModal()
                        void refetch()
                      },
                      onError: (e: any) => alertLib.fire(t('docker.deployFailed'), e.response?.data?.error || t('docker.unknownError'), 'error', 'apps'),
                    },
                  )
                } else {
                  deployComposeMut.mutate(
                    {
                      name: deployForm.name.trim(),
                      replaceContainerId: editContainer?.id,
                      composeYaml: deployForm.composeYaml,
                    },
                    {
                      onSuccess: async () => {
                        toast.success(t('docker.composeProjectDeployed', { name: deployForm.name }))
                        if (showSaveAsTpl && saveTemplateName.trim()) {
                          try {
                            await createTemplateMut.mutateAsync({ name: saveTemplateName.trim(), description: '', yamlContent: deployForm.composeYaml })
                            toast.success(t('docker.templateSaved'))
                          } catch { /* silent */ }
                        }
                        resetDeployModal()
                        void refetch()
                      },
                      onError: (e: any) => alertLib.fire(t('docker.composeDeployFailed'), e.response?.data?.error || t('docker.unknownError'), 'error', 'apps'),
                    },
                  )
                }
              }}
            >
              {(deployImageMut.isPending || deployComposeMut.isPending) ? (
                <>
                  <DeployStep label={t('docker.pullingImage')} delay={0} />
                  <DeployStep label={t('docker.creatingContainer')} delay={1200} />
                  <DeployStep label={t('docker.starting')} delay={2400} />
                </>
              ) : editContainer ? t('docker.redeploy') : t('docker.deploy')}
            </Button>
        </>
      }
    >
    <div className="docker-deploy-tabs">
      <button
        type="button"
        onClick={() => setDeployType('image')}
        className={`panel-btn justify-center text-[12px] font-semibold shadow-none ${deployType === 'image' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
      >
        <Box className="h-4 w-4" /> {t('docker.deployFromImage')}
      </button>
      <button
        type="button"
        onClick={() => setDeployType('compose')}
        className={`panel-btn justify-center text-[12px] font-semibold shadow-none ${deployType === 'compose' ? 'panel-btn--primary-soft' : 'panel-btn--ghost'}`}
      >
        <Code className="h-4 w-4" /> {t('docker.deployFromCompose')}
      </button>
    </div>

    <div className="docker-deploy-modal__body">
      {/* Project / Container Name — combobox */}
      <div>
        <label className="panel-section-label">{t('docker.projectContainerName')}</label>
        <div className="docker-image-combobox" ref={nameComboRef}>
          <div className="docker-image-combobox__input-wrap">
            <input
              value={deployForm.name}
              onChange={(e) => !editContainer && setDeployForm({ ...deployForm, name: e.target.value })}
              onFocus={() => { if (!editContainer) { setNameDropdownOpen(true); setImgDropdownOpen(false); setNetDropdownOpen(false) } }}
              placeholder={t('docker.projectNamePlaceholder')}
              className={`panel-input docker-image-combobox__input ${editContainer ? 'opacity-60 cursor-not-allowed' : ''}`}
              autoComplete="off"
              readOnly={!!editContainer}
            />
            {deployForm.name && !editContainer && (
              <button type="button" className="docker-image-combobox__clear" onClick={() => { setDeployForm({ ...deployForm, name: '' }); setNameDropdownOpen(false) }} title={t('docker.clear')}>
                <X className="h-3 w-3" />
              </button>
            )}
            {(deployType === 'compose' ? (templatesData?.items?.length ?? 0) : 0) > 0 && (
              <button type="button" className="docker-image-combobox__toggle" onClick={() => { setNameDropdownOpen((v) => !v); setImgDropdownOpen(false); setNetDropdownOpen(false) }}>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {nameDropdownOpen && deployType === 'compose' && (templatesData?.items?.length ?? 0) > 0 && (
            <div className="docker-image-combobox__dropdown">
              {(templatesData?.items ?? [])
                .filter((t) => !deployForm.name || t.name.toLowerCase().includes(deployForm.name.toLowerCase()))
                .map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    className={`docker-image-combobox__item ${deployForm.name === tmpl.name ? 'docker-image-combobox__item--selected' : ''}`}
                    onClick={() => {
                      setDeployForm((f) => ({ ...f, name: tmpl.name, composeYaml: tmpl.yamlContent }))
                      setSaveTemplateName(tmpl.name)
                      setNameDropdownOpen(false)
                    }}
                  >
                    <span className="docker-image-combobox__item-name">{tmpl.name}</span>
                    {tmpl.description && <span className="docker-image-combobox__item-size">{tmpl.description}</span>}
                    {deployForm.name === tmpl.name && <Check className="h-3.5 w-3.5 ml-auto" />}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {deployType === 'image' ? (
        <div className="mt-4 grid grid-cols-2 gap-6 mobile:grid-cols-1 mobile:gap-4">
          <div className="space-y-4">
            {/* Docker Image combobox */}
            <div>
              <label className="panel-section-label">{t('docker.dockerImageRequired')}</label>
              <div className="docker-image-combobox" ref={imgComboRef}>
                <div className="docker-image-combobox__input-wrap">
                  <TextInput
                    value={deployForm.image}
                    onChange={(e) => { setDeployForm({ ...deployForm, image: e.target.value }); setImgInputValue(e.target.value) }}
                    onFocus={() => { setImgDropdownOpen(true); setNameDropdownOpen(false); setNetDropdownOpen(false) }}
                    placeholder={t('docker.imagePlaceholder')} className="docker-image-combobox__input"
                    autoComplete="off"
                  />
                  {deployForm.image && (
                    <button type="button" className="docker-image-combobox__clear" onClick={() => { setDeployForm({ ...deployForm, image: '' }); setImgInputValue(''); setImgDropdownOpen(false) }} title={t('docker.clear')}>
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <button type="button" className="docker-image-combobox__toggle" onClick={() => { setImgDropdownOpen((v) => !v); setNameDropdownOpen(false); setNetDropdownOpen(false) }}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                {imgDropdownOpen && (imagesData?.items?.length ?? 0) > 0 && (
                  <div className="docker-image-combobox__dropdown">
                    {(imagesData?.items ?? [])
                      .filter((img) => !imgInputValue || `${img.Repository}:${img.Tag}`.toLowerCase().includes(imgInputValue.toLowerCase()))
                      .map((img) => {
                        const val = `${img.Repository}:${img.Tag}`
                        return (
                          <button
                            key={img.Id}
                            type="button"
                            className={`docker-image-combobox__item ${deployForm.image === val ? 'docker-image-combobox__item--selected' : ''}`}
                            onClick={() => { setDeployForm({ ...deployForm, image: val }); setImgInputValue(val); setImgDropdownOpen(false) }}
                          >
                            <span className="docker-image-combobox__item-name">{img.Repository}</span>
                            <Badge>{img.Tag}</Badge>
                            <span className="docker-image-combobox__item-size">{img.Size}</span>
                            {deployForm.image === val && <Check className="h-3.5 w-3.5 ml-auto" />}
                          </button>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* Registry Authentication */}
            <div className="docker-auth-block">
              <Checkbox
                checked={deployForm.registryAuth.enabled}
                onChange={(checked) => setDeployForm((current) => ({
                  ...current,
                  registryAuth: { ...current.registryAuth, enabled: checked },
                }))}
                label={t('docker.useRegistryAuth')}
              />
              {deployForm.registryAuth.enabled && (
                <div className="docker-auth-grid">
                  <div className="panel-field">
                    <label className="panel-label">{t('docker.registry')} <span className="docker-field-optional">{t('docker.optional')}</span></label>
                    <TextInput
                      placeholder={t('docker.registryPlaceholder')}
                      value={deployForm.registryAuth.registry}
                      onChange={(e) => setDeployForm((current) => ({
                        ...current,
                        registryAuth: { ...current.registryAuth, registry: e.target.value },
                      }))}
                    />
                  </div>
                  <div className="panel-field">
                    <label className="panel-label">{t('docker.usernameEmailRequired')}</label>
                    <TextInput
                      placeholder={t('docker.usernameEmailPlaceholder')}
                      value={deployForm.registryAuth.usernameOrEmail}
                      onChange={(e) => setDeployForm((current) => ({
                        ...current,
                        registryAuth: { ...current.registryAuth, usernameOrEmail: e.target.value },
                      }))}
                    />
                  </div>
                  <div className="panel-field docker-auth-grid__full">
                    <label className="panel-label">{t('docker.passwordRequired')}</label>
                    <TextInput
                      type="password"
                      placeholder={t('docker.passwordPlaceholder')}
                      value={deployForm.registryAuth.password}
                      onChange={(e) => setDeployForm((current) => ({
                        ...current,
                        registryAuth: { ...current.registryAuth, password: e.target.value },
                      }))}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Network combobox */}
            <div>
              <label className="panel-section-label">{t('docker.network')}</label>
              <div className="docker-image-combobox" ref={netComboRef}>
                <div className="docker-image-combobox__input-wrap">
                  <TextInput
                    value={netInputValue || deployForm.network}
                    onChange={(e) => {
                      setNetInputValue(e.target.value)
                      setNetDropdownOpen(true)
                      setImgDropdownOpen(false)
                      setNameDropdownOpen(false)
                    }}
                    onFocus={() => {
                      setNetDropdownOpen(true)
                      setImgDropdownOpen(false)
                      setNameDropdownOpen(false)
                    }}
                    placeholder={t('docker.networkPlaceholder')} className="docker-image-combobox__input"
                    autoComplete="off"
                  />
                  {(deployForm.network || netInputValue) && (
                    <button
                      type="button"
                      className="docker-image-combobox__clear"
                      onClick={() => {
                        setDeployForm({ ...deployForm, network: '' })
                        setNetInputValue('')
                        setNetDropdownOpen(false)
                      }}
                      title={t('docker.resetDefault')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <button type="button" className="docker-image-combobox__toggle" onClick={() => { setNetDropdownOpen((v) => !v); setImgDropdownOpen(false); setNameDropdownOpen(false) }}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                {netDropdownOpen && (
                  <div className="docker-image-combobox__dropdown">
                    <button
                      type="button"
                      className={`docker-image-combobox__item ${!deployForm.network ? 'docker-image-combobox__item--selected' : ''}`}
                      onClick={() => {
                        setDeployForm({ ...deployForm, network: '' })
                        setNetInputValue('')
                        setNetDropdownOpen(false)
                      }}
                    >
                      <span className="docker-image-combobox__item-name">{t('docker.defaultBridge')}</span>
                      {!deployForm.network && <Check className="h-3.5 w-3.5 ml-auto" />}
                    </button>
                    {(networksData?.items ?? [])
                      .filter((net) => !netInputValue || net.Name.toLowerCase().includes(netInputValue.toLowerCase()))
                      .map((net) => (
                        <button
                          key={net.Id}
                          type="button"
                          className={`docker-image-combobox__item ${deployForm.network === net.Name ? 'docker-image-combobox__item--selected' : ''}`}
                          onClick={() => {
                            setDeployForm({ ...deployForm, network: net.Name })
                            setNetInputValue('')
                            setNetDropdownOpen(false)
                          }}
                        >
                          <span className="docker-image-combobox__item-name">{net.Name}</span>
                          <span className="docker-image-combobox__item-size">{net.Driver}</span>
                          {deployForm.network === net.Name && <Check className="h-3.5 w-3.5 ml-auto" />}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right side: ports, env, volumes */}
          <div className="space-y-4">
            {/* Ports */}
            <div>
              <label className="panel-section-label">{t('docker.ports')}</label>
              {deployForm.ports.map((port, idx) => (
                <div key={idx} className="docker-port-row">
                  <TextInput className="docker-port-input"
                    placeholder={t('docker.hostPortPlaceholder')}
                    value={port.hostPort}
                    onChange={(e) => {
                      const ports = [...deployForm.ports]
                      ports[idx] = { ...ports[idx], hostPort: e.target.value }
                      setDeployForm({ ...deployForm, ports })
                    }}
                  />
                  <span className="docker-port-sep">:</span>
                  <TextInput className="docker-port-input"
                    placeholder={t('docker.containerPortPlaceholder')}
                    value={port.containerPort}
                    onChange={(e) => {
                      const ports = [...deployForm.ports]
                      ports[idx] = { ...ports[idx], containerPort: e.target.value }
                      setDeployForm({ ...deployForm, ports })
                    }}
                  />
                  {deployForm.ports.length > 1 && (
                    <button
                      type="button"
                      className="panel-icon-btn text-[var(--panel-danger-text)]"
                      onClick={() => {
                        const ports = deployForm.ports.filter((_, i) => i !== idx)
                        setDeployForm({ ...deployForm, ports })
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button" variant="ghost" className="text-[12px]"
                onClick={() => setDeployForm({ ...deployForm, ports: [...deployForm.ports, { hostPort: '', containerPort: '' }] })}
              >
                <Plus className="h-3 w-3" /> {t('docker.addPort')}
              </Button>
            </div>

            {/* Environment Variables */}
            <div>
              <label className="panel-section-label">{t('docker.environmentVariables')}</label>
              <Tabs
                className="mb-2"
                label={t('docker.environmentVariables')}
                value={deployForm.envMode}
                onChange={(mode) => {
                  if (mode === deployForm.envMode) return
                  setDeployForm(
                    mode === 'form'
                      ? { ...deployForm, envMode: 'form', env: toEnvRows(deployForm.envRaw) }
                      : { ...deployForm, envMode: 'raw', envRaw: toRawEnv(deployForm.env) },
                  )
                }}
                items={[
                  { key: 'form', label: t('docker.envFormMode') },
                  { key: 'raw', label: t('docker.envRawMode') },
                ]}
              />
              {deployForm.envMode === 'form' ? (
                <>
                  {deployForm.env.map((envRow, idx) => (
                    <div key={idx} className="docker-env-row">
                      <TextInput className="docker-env-key"
                        placeholder={t('docker.envKeyPlaceholder')}
                        value={envRow.key}
                        onChange={(e) => {
                          const env = [...deployForm.env]
                          env[idx] = { ...env[idx], key: e.target.value }
                          setDeployForm({ ...deployForm, env })
                        }}
                      />
                      <TextInput className="docker-env-value"
                        placeholder={t('docker.envValuePlaceholder')}
                        value={envRow.value}
                        onChange={(e) => {
                          const env = [...deployForm.env]
                          env[idx] = { ...env[idx], value: e.target.value }
                          setDeployForm({ ...deployForm, env })
                        }}
                      />
                      {deployForm.env.length > 1 && (
                        <button
                          type="button"
                          className="panel-icon-btn text-[var(--panel-danger-text)]"
                          onClick={() => {
                            const env = deployForm.env.filter((_, i) => i !== idx)
                            setDeployForm({ ...deployForm, env: env.length > 0 ? env : [EMPTY_ENV_ROW] })
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button" variant="ghost" className="text-[12px]"
                    onClick={() => setDeployForm({ ...deployForm, env: [...deployForm.env, { key: '', value: '' }] })}
                  >
                    <Plus className="h-3 w-3" /> {t('docker.addEnv')}
                  </Button>
                </>
              ) : (
                <textarea
                  className="panel-input docker-modal__yaml"
                  rows={6}
                  placeholder={t('docker.envRawPlaceholder')}
                  value={deployForm.envRaw}
                  onChange={(e) => setDeployForm({ ...deployForm, envRaw: e.target.value })}
                />
              )}
            </div>

            {/* Volumes */}
            <div>
              <label className="panel-section-label">{t('docker.volumes')}</label>
              {deployForm.volumes.map((vol, idx) => (
                <div key={idx} className="docker-port-row">
                  <TextInput className="docker-port-input"
                    placeholder={t('docker.hostPathPlaceholder')}
                    value={vol.hostPath}
                    onChange={(e) => {
                      const volumes = [...deployForm.volumes]
                      volumes[idx] = { ...volumes[idx], hostPath: e.target.value }
                      setDeployForm({ ...deployForm, volumes })
                    }}
                  />
                  <span className="docker-port-sep">:</span>
                  <TextInput className="docker-port-input"
                    placeholder={t('docker.containerPathPlaceholder')}
                    value={vol.containerPath}
                    onChange={(e) => {
                      const volumes = [...deployForm.volumes]
                      volumes[idx] = { ...volumes[idx], containerPath: e.target.value }
                      setDeployForm({ ...deployForm, volumes })
                    }}
                  />
                  {deployForm.volumes.length > 1 && (
                    <button
                      type="button"
                      className="panel-icon-btn text-[var(--panel-danger-text)]"
                      onClick={() => {
                        const volumes = deployForm.volumes.filter((_, i) => i !== idx)
                        setDeployForm({ ...deployForm, volumes })
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button" variant="ghost" className="text-[12px]"
                onClick={() => setDeployForm({ ...deployForm, volumes: [...deployForm.volumes, { hostPath: '', containerPath: '' }] })}
              >
                <Plus className="h-3 w-3" /> {t('docker.addVolume')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Compose YAML editor */
        <div className="mt-4 space-y-4">
          <div>
            <label className="panel-section-label">{t('docker.composeYamlRequired')}</label>
            <textarea
              className="panel-input docker-modal__yaml"
              rows={16}
              value={deployForm.composeYaml}
              onChange={(e) => setDeployForm({ ...deployForm, composeYaml: e.target.value })}
            />
          </div>
          <Checkbox
            checked={showSaveAsTpl}
            onChange={(checked) => {
              setShowSaveAsTpl(checked)
              if (checked && !saveTemplateName) setSaveTemplateName(deployForm.name)
            }}
            label={t('docker.saveAsTemplate')}
          />
          {showSaveAsTpl && (
            <div className="panel-field">
              <label className="panel-label">{t('docker.templateName')}</label>
              <TextInput
                placeholder={t('docker.composeTemplateNamePlaceholder')}
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
    </div>

    </Modal>
  )
}
