export function crearPDFGantt({jsPDF,ot,filas,periodo}) {
  const pdf=new jsPDF({orientation:'landscape',format:'a4'});
  const ancho=pdf.internal.pageSize.getWidth(),alto=pdf.internal.pageSize.getHeight();
  const x=98,w=ancho-x-14,inicio=Date.parse(periodo.inicio),duracion=Math.max(86400000,Date.parse(periodo.fin)-inicio+86400000);
  const fecha=v=>String(v || '').split('-').reverse().join('-');
  let y=0,numeroFila=0;
  function cabecera() {
    pdf.setFillColor(10,34,55);pdf.rect(0,0,ancho,33,'F');pdf.setTextColor(255,255,255);
    pdf.setFont('helvetica','bold');pdf.setFontSize(18);pdf.text('Carta Gantt',14,14);
    pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.text(pdf.splitTextToSize(`OS: ${ot.os} | Equipo: ${ot.equipo || ''}`,ancho-28).slice(0,2),14,22);
    pdf.setTextColor(55,80,100);pdf.setFontSize(9);pdf.text(`Periodo: ${fecha(periodo.inicio)} al ${fecha(periodo.fin)} | Etapas principales y espera de repuestos`,14,41);
    pdf.setFillColor(233,242,251);pdf.rect(14,47,ancho-28,13,'F');pdf.setFont('helvetica','bold');pdf.text('Etapa / periodo',18,55);
    pdf.setFont('helvetica','normal');pdf.setFontSize(8);
    for(let i=0;i<=5;i++) {
      const t=inicio+(duracion-86400000)*i/5;
      pdf.text(fecha(new Date(t).toISOString().slice(0,10)),x+w*i/5,55,{align:i===5?'right':i===0?'left':'center'});
    }
    y=60;
  }
  cabecera();
  for(const fila of filas) {
    const nombre=pdf.splitTextToSize(String(fila.nombre),77),h=Math.max(21,nombre.length*4+12);
    if(y+h>alto-22){pdf.addPage();cabecera();}
    pdf.setFillColor(...(numeroFila++%2?[246,249,252]:[255,255,255]));pdf.rect(14,y,ancho-28,h,'F');
    pdf.setDrawColor(215,228,239);pdf.setLineWidth(.2);pdf.line(14,y+h,ancho-14,y+h);
    for(let i=0;i<=5;i++)pdf.line(x+w*i/5,y,x+w*i/5,y+h);
    pdf.setTextColor(32,62,86);pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.text(nombre,18,y+6);
    pdf.setFont('helvetica','normal');pdf.setFontSize(7.5);pdf.setTextColor(95,116,134);
    pdf.text(`${fecha(fila.inicio)} - ${fecha(fila.fin)}`,18,y+6+nombre.length*4);
    pdf.text(fila.tipo==='espera'?`${fila.duracion} dias habiles de espera`:`Avance: ${fila.avance}%`,18,y+10+nombre.length*4);
    const desde=Date.parse(fila.inicio),hasta=Date.parse(fila.fin);
    if(Number.isFinite(desde) && Number.isFinite(hasta)) {
      const izquierda=x+Math.max(0,(desde-inicio)/duracion)*w;
      const barra=Math.max(.7,Math.min(w-(izquierda-x),(hasta-desde+86400000)/duracion*w));
      pdf.setFillColor(...(fila.tipo==='espera'?[239,183,72]:[39,98,147]));pdf.roundedRect(izquierda,y+(h-6)/2,barra,6,1,1,'F');
      if(fila.tipo!=='espera' && fila.avance>0) {pdf.setFillColor(35,166,113);pdf.rect(izquierda,y+(h-6)/2,barra*Math.min(100,fila.avance)/100,6,'F');}
    }
    y+=h;
  }
  const paginas=pdf.getNumberOfPages();
  for(let p=1;p<=paginas;p++) {
    pdf.setPage(p);pdf.setFontSize(8);pdf.setFont('helvetica','normal');pdf.setTextColor(100,120,138);
    pdf.setFillColor(39,98,147);pdf.rect(14,alto-13,3,3,'F');pdf.text('Planificado',19,alto-10.5);
    pdf.setFillColor(35,166,113);pdf.rect(51,alto-13,3,3,'F');pdf.text('Avance del checklist',56,alto-10.5);
    pdf.setFillColor(239,183,72);pdf.rect(101,alto-13,3,3,'F');pdf.text('Espera de repuestos',106,alto-10.5);
    pdf.text(`Vectaria | ${p} / ${paginas}`,ancho-14,alto-10.5,{align:'right'});
  }
  return pdf;
}
