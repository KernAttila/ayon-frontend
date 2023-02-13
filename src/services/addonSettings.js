import { ayonApi } from './ayon'

const apiSuffix = (projectName, siteId, environment) => {
  let suffix = ''
  if (projectName && projectName !== '_') {
    suffix += `/${projectName}`
    if (siteId && siteId !== '_') {
      suffix += `?site=${siteId}`
    }
  }
  if (environment) {
    if (siteId && siteId !== '_') {
      suffix += `&variant=${environment}`
    } else {
      suffix += `?variant=${environment}`
    }
  }
  console.log('Suffix: ' + suffix)
  return suffix
}

const addonSettings = ayonApi.injectEndpoints({
  endpoints: (build) => ({
    getAddonSettingsSchema: build.query({
      query: ({ addonName, addonVersion, projectName, siteId }) => ({
        url: `/api/addons/${addonName}/${addonVersion}/schema${apiSuffix(projectName, siteId)}`,
        method: 'GET',
      }),

      // eslint-disable-next-line no-unused-vars
      providesTags: (result, error, arg) => [{ type: 'addonSettingsSchema', ...arg }],
      transformResponse: (response) => response,
      transformErrorResponse: (error) => error.data.detail || `Error ${error.status}`,
    }),

    getAddonSettings: build.query({
      query: ({ addonName, addonVersion, projectName, siteId, environment }) => ({
        url: `/api/addons/${addonName}/${addonVersion}/settings${apiSuffix(
          projectName,
          siteId,
          environment,
        )}`,
        method: 'GET',
      }),

      // eslint-disable-next-line no-unused-vars
      providesTags: (result, error, arg) => [{ type: 'addonSettings', ...arg }],
      transformResponse: (response) => response,
      transformErrorResponse: (error) => error.data.detail || `Error ${error.status}`,
    }),

    getAddonSettingsOverrides: build.query({
      query: ({ addonName, addonVersion, projectName, siteId, environment }) => ({
        url: `/api/addons/${addonName}/${addonVersion}/overrides${apiSuffix(
          projectName,
          siteId,
          environment,
        )}`,
        method: 'GET',
      }),

      // eslint-disable-next-line no-unused-vars
      providesTags: (result, error, arg) => [{ type: 'addonSettingsOverrides', ...arg }],
      transformResponse: (response) => response,
      transformErrorResponse: (error) => error.data.detail || `Error ${error.status}`,
    }),

    setAddonSettings: build.mutation({
      query: ({ addonName, addonVersion, projectName, siteId, data, environment }) => ({
        url: `/api/addons/${addonName}/${addonVersion}/settings${apiSuffix(
          projectName,
          siteId,
          environment,
        )}`,
        method: 'POST',
        body: data,
      }),

      // eslint-disable-next-line no-unused-vars
      invalidatesTags: (result, error, arg) => [
        {
          type: 'addonSettings',
          addonName: arg.addonName,
          addonVersion: arg.addonVersion,
          projectName: arg.projectName,
          siteId: arg.siteId,
          environment: arg.environment,
        },
        {
          type: 'addonSettingsOverrides',
          addonName: arg.addonName,
          addonVersion: arg.addonVersion,
          projectName: arg.projectName,
          siteId: arg.siteId,
          environment: arg.environment,
        },
      ],
      transformResponse: (response) => response,
      transformErrorResponse: (error) => error.data.detail || `Error ${error.status}`,
    }), // setAddonSettings

    deleteAddonSettings: build.mutation({
      query: ({ addonName, addonVersion, projectName, siteId, environment }) => ({
        url: `/api/addons/${addonName}/${addonVersion}/overrides${apiSuffix(
          projectName,
          siteId,
          environment,
        )}`,
        method: 'DELETE',
      }),
      // eslint-disable-next-line no-unused-vars
      invalidatesTags: (result, error, arg) => [
        {
          type: 'addonSettings',
          addonName: arg.addonName,
          addonVersion: arg.addonVersion,
          projectName: arg.projectName,
          siteId: arg.siteId,
          environment: arg.environment,
        },
        {
          type: 'addonSettingsOverrides',
          addonName: arg.addonName,
          addonVersion: arg.addonVersion,
          projectName: arg.projectName,
          siteId: arg.siteId,
          environment: arg.environment,
        },
      ],
      transformResponse: (response) => response,
      transformErrorResponse: (error) => error.data.detail || `Error ${error.status}`,
    }), // setAddonSettings

    modifyAddonOverride: build.mutation({
      query: ({ addonName, addonVersion, projectName, siteId, action, path, environment }) => ({
        url: `/api/addons/${addonName}/${addonVersion}/overrides${apiSuffix(
          projectName,
          siteId,
          environment,
        )}`,
        method: 'POST',
        body: { action, path },
      }),
      // eslint-disable-next-line no-unused-vars
      invalidatesTags: (result, error, arg) => [
        {
          type: 'addonSettings',
          addonName: arg.addonName,
          addonVersion: arg.addonVersion,
          projectName: arg.projectName,
          siteId: arg.siteId,
          environment: arg.environment,
        },
        {
          type: 'addonSettingsOverrides',
          addonName: arg.addonName,
          addonVersion: arg.addonVersion,
          projectName: arg.projectName,
          siteId: arg.siteId,
          environment: arg.environment,
        },
      ],
      transformResponse: (response) => response,
      transformErrorResponse: (error) => error.data.detail || `Error ${error.status}`,
    }), // setAddonSettings
  }), // endpoints
}) // addonSettings

export const {
  useGetAddonSettingsSchemaQuery,
  useGetAddonSettingsQuery,
  useGetAddonSettingsOverridesQuery,
  useSetAddonSettingsMutation,
  useDeleteAddonSettingsMutation,
  useModifyAddonOverrideMutation,
} = addonSettings