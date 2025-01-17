import {
  Divider,
  FormLayout,
  FormRow,
  InputSwitch,
  InputText,
  Panel,
  Section,
} from '@ynput/ayon-react-components'
import React, { useMemo } from 'react'
import styled from 'styled-components'
import BundlesAddonList from './BundlesAddonList'
import * as Styled from './Bundles.styled'
import { upperFirst } from 'lodash'
import InstallerSelector from './InstallerSelector'
import { useSelector } from 'react-redux'
import { useGetUsersQuery } from '/src/services/user/getUsers'

const StyledColumns = styled.div`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
  overflow: hidden;
`

const BundleForm = ({
  formData,
  setFormData,
  isNew,
  isDev,
  installers = [],
  children,
  selectedAddons,
  setSelectedAddons,
  onAddonDevChange,
  developerMode,
  addonListRef,
}) => {
  const showNameError = formData && !formData?.name && isNew
  const currentUser = useSelector((state) => state.user.name)
  const { data: users = [], isLoading } = useGetUsersQuery({ selfName: currentUser })
  const devs = users?.filter((u) => u.isDeveloper)
  const installerPlatforms = installers.find(
    (i) => i.version === formData?.installerVersion,
  )?.platforms

  const devSelectOptions = useMemo(
    () =>
      devs.map((d) => ({
        name: d.name,
        fullName: d.attrib?.fullName || d.name,
        avatarUrl: d.attrib?.avatarUrl,
      })),
    [devs],
  )

  if (!formData) return null

  return (
    <Panel style={{ flexGrow: 1, overflow: 'hidden' }}>
      <FormLayout style={{ gap: 8, paddingTop: 1, maxWidth: 900 }}>
        <FormRow label="Name">
          {isNew ? (
            <InputText
              value={formData?.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={showNameError ? { outline: '1px solid var(--color-hl-error)' } : {}}
              disabled={!formData || isDev}
            />
          ) : (
            <h2 style={{ margin: 0 }}>{formData?.name}</h2>
          )}
        </FormRow>
        <FormRow label="Launcher version">
          {isNew ? (
            <InstallerSelector
              value={formData?.installerVersion ? [formData?.installerVersion] : []}
              options={installers}
              onChange={(e) => setFormData({ ...formData, installerVersion: e[0] })}
              disabled={!formData}
            />
          ) : (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <h2 style={{ margin: 0, marginRight: 32 }}>{formData?.installerVersion || 'NONE'}</h2>
              <>
                {!!installerPlatforms?.length &&
                  installerPlatforms.map((platform) => (
                    <Styled.PlatformTag key={platform} $platform={platform}>
                      {upperFirst(platform === 'darwin' ? 'macOS' : platform)}
                    </Styled.PlatformTag>
                  ))}
              </>
            </div>
          )}
        </FormRow>
        {developerMode && !isDev && (
          <FormRow label="Dev bundle">
            <InputSwitch
              checked={formData.isDev}
              onChange={() => setFormData({ ...formData, isDev: !formData.isDev })}
            />
          </FormRow>
        )}
        {(isDev || developerMode) && (
          <FormRow label="Assigned dev" fieldStyle={{ flexDirection: 'row', gap: 8 }}>
            <Styled.DevSelect
              editor
              emptyMessage={'Assign developer...'}
              value={[formData.activeUser]}
              options={devSelectOptions}
              disabled={isLoading || !formData.isDev}
              multiSelect={false}
              onChange={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  activeUser: v[0],
                }))
              }
            />
            <Styled.BadgeButton
              label="Assign to me"
              $hl={'developer-surface'}
              icon={'person_pin_circle'}
              style={{
                justifyContent: 'center',
                width: 'auto',
              }}
              disabled={formData.activeUser === currentUser || isLoading || !formData.isDev}
              onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  activeUser: currentUser,
                }))
              }}
            />
          </FormRow>
        )}
      </FormLayout>
      <Divider />
      <StyledColumns style={{ maxWidth: 1500 }}>
        <section style={{ height: '100%', minWidth: 500, flex: 1 }}>
          <section style={{ height: '100%' }}>
            <BundlesAddonList
              readOnly={!isNew}
              {...{ formData, setFormData }}
              setSelected={setSelectedAddons}
              selected={selectedAddons}
              isDev={isDev || formData.isDev}
              onDevChange={onAddonDevChange}
              ref={addonListRef}
            />
          </section>
        </section>
        <Section style={{ overflow: 'hidden', alignItems: 'flex-start', flex: 'none' }}>
          {children}
        </Section>
      </StyledColumns>
    </Panel>
  )
}

export default BundleForm
