/** Download a data URL as a file. */
function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

/**
 * Export the G6 graph as a PNG file.
 */
export async function exportToPNG(
  graph: { toDataURL: (type: string, options?: Record<string, unknown>) => Promise<string> },
  filename = 'topology.png'
) {
  const dataURL = await graph.toDataURL('image/png', { padding: 20 });
  download(dataURL, filename);
}

/**
 * Export the G6 graph as an SVG file.
 */
export async function exportToSVG(
  graph: { toDataURL: (type: string, options?: Record<string, unknown>) => Promise<string> },
  filename = 'topology.svg'
) {
  const dataURL = await graph.toDataURL('image/svg+xml', { padding: 20 });
  download(dataURL, filename);
}

/**
 * Export the G6 graph as a PDF file using jsPDF.
 */
export async function exportToPDF(
  graph: { toDataURL: (type: string, options?: Record<string, unknown>) => Promise<string> },
  filename = 'topology.pdf'
) {
  const { jsPDF } = await import('jspdf');
  const url = await graph.toDataURL('image/png', { padding: 20 });
  const pdf = new jsPDF('landscape');
  pdf.addImage(url, 'PNG', 10, 10, 277, 190);
  pdf.save(`${filename}`);
}

export type ExportFormat = 'png' | 'svg' | 'pdf';

/** Unified export helper. */
export async function exportGraph(
  graph: { toDataURL: (type: string, options?: Record<string, unknown>) => Promise<string> },
  format: ExportFormat,
  filename = 'topology'
) {
  if (format === 'png') return exportToPNG(graph, `${filename}.png`);
  if (format === 'svg') return exportToSVG(graph, `${filename}.svg`);
  if (format === 'pdf') return exportToPDF(graph, `${filename}.pdf`);
}
