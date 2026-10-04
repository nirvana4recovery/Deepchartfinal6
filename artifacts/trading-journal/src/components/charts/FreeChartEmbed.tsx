/**
 * Local compatibility export.
 *
 * The external The Free Chart website/iframe integration has been removed.
 * Charts now use DeepCharts' own local chart engine from CustomChart.tsx.
 * Keeping this export preserves the existing Charts page import without
 * introducing any external chart ownership or navigation.
 */
export { default } from "./CustomChart";
