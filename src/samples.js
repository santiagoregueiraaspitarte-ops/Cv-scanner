// Sample data so the app works with no uploads, in English and Spanish.
// All people, companies and contact details are fictional. `label` is shown in the interface language.

export const SAMPLE_RESUMES = {
  strong: {
    id: 'strong',
    lang: 'en',
    label: { en: 'strong sample (software engineering, English)', es: 'ejemplo sólido (ingeniería de software, en inglés)' },
    text: `Avery Quill
avery.quill@example.com · (555) 010-4477 · linkedin.com/in/avery-quill-example

SUMMARY
Software engineer with 6 years of experience building reliable web platforms. Led migrations that cut infrastructure costs by 32% and improved page load times by 45%. Focused on developer experience, observability and mentoring.

EXPERIENCE
Senior Software Engineer, Northwind Lattice Inc. — Jan 2021 – Present
- Led migration of 14 services from a monolith to Kubernetes, reducing deploy time from 40 to 6 minutes.
- Designed a TypeScript and React design system adopted by 9 product teams, cutting UI defects by 38%.
- Built CI/CD pipelines in GitHub Actions that run 2,400 tests per commit with 99.9% reliability.
- Mentored 5 junior engineers through weekly code reviews; 3 were promoted within 18 months.
- Worked with product and design to define the quarterly platform roadmap.

Software Engineer, Brightfjord Labs — Jun 2018 – Dec 2020
- Developed REST APIs in Node.js and PostgreSQL serving 1.2M requests per day.
- Reduced p95 API latency by 60% by introducing Redis caching and query indexing.
- Automated release checks, saving the team 10 hours per week.
- Implemented an A/B testing framework used in 25 experiments that raised sign-up conversion by 12%.

EDUCATION
B.S. Computer Science, Cedarbrook State University — 2014 – 2018

SKILLS
JavaScript, TypeScript, React, Node.js, PostgreSQL, Redis, Docker, Kubernetes, AWS, CI/CD, GraphQL, Python
`,
  },
  weak: {
    id: 'weak',
    lang: 'en',
    label: { en: 'weak sample (junior developer, English)', es: 'ejemplo débil (desarrollo junior, en inglés)' },
    text: `Jordan Pike
jordanpike@example.com

My Journey
I am a hard working person who is looking for a job in software where I can grow and learn new things.

Work Experience
Developer at Grayfield Widgets
- Responsible for working on the website.
- I helped with fixing bugs and worked on different features for the team when they needed help with stuff and other things that came up during the week and also some meetings.
- Participated in meetings.
- Handled emails from customers.

Intern | Lumen & Larch Digital | Summer
- Assisted the senior developer.
- Was involved in testing.

Stuff I Know
HTML	CSS	JavaScript	some Python
[image: logo.png]
`,
  },
  strongEs: {
    id: 'strongEs',
    lang: 'es',
    label: { en: 'strong sample (data analysis, Spanish)', es: 'ejemplo sólido (análisis de datos, en español)' },
    text: `Lucía Ferraro
lucia.ferraro@example.com · +54 11 5555-0142 · linkedin.com/in/lucia-ferraro-ejemplo

RESUMEN PROFESIONAL
Analista de datos con 5 años de experiencia transformando datos en decisiones para equipos comerciales y de producto. Construí tableros en Power BI usados por 120 personas y automaticé reportes que ahorran 15 horas por semana.

EXPERIENCIA LABORAL
Analista de Datos Senior, Grupo Altamira — Mar 2022 – Actualidad
- Lideré la migración de 40 reportes de Excel a Power BI, reduciendo el tiempo de actualización de 2 días a 3 horas.
- Diseñé un modelo de pronóstico de ventas en Python con un error del 6%, adoptado por 3 regiones.
- Automaticé procesos ETL en SQL y Python, ahorrando 15 horas de trabajo por semana.
- Coordiné un equipo de 4 analistas y capacité a 25 usuarios en análisis de datos.
- Presenté recomendaciones a la dirección que redujeron el inventario inmovilizado un 18%.

Analista de Datos, Ventura Retail — Jun 2019 – Feb 2022
- Analicé 30 pruebas A/B que aumentaron la conversión del sitio un 9%.
- Desarrollé tableros de control en Tableau para 12 gerentes, usados en las reuniones semanales de ventas.
- Reduje los errores de facturación un 35% con controles automáticos en SQL.
- Trabajé con el equipo de producto para definir los indicadores clave del trimestre.

EDUCACIÓN
Licenciatura en Economía, Universidad del Plata — 2014 – 2019

HABILIDADES
SQL, Python, pandas, Power BI, Tableau, Excel, estadística, regresión, ETL

IDIOMAS
Español (nativo), inglés (avanzado)
`,
  },
  weakEs: {
    id: 'weakEs',
    lang: 'es',
    label: { en: 'weak sample (sales, Spanish)', es: 'ejemplo débil (ventas, en español)' },
    text: `Martín Sosa
martinsosa@example.com

Mi Historia
Yo soy una persona muy responsable que busca un trabajo en ventas donde pueda crecer y aprender cosas nuevas.

Experiencia
Vendedor en Comercial del Sur
- Responsable de atender clientes en el local.
- Me encargué de ordenar el depósito y ayudé con las cosas que hacían falta en la semana y también en otras tareas que surgían cuando mi jefe lo pedía y además algunas reuniones.
- Participé en reuniones.
- Trabajé con proveedores.

Pasante | Distribuidora Norte | Verano
- Ayudé al encargado.
- Estuve a cargo de la caja.

Cosas Que Sé
Excel	Ventas	Atención al cliente	algo de inglés
[imagen: logo.png]
`,
  },
};

export const SAMPLE_JOBS = {
  softwareEngineer: {
    id: 'softwareEngineer',
    lang: 'en',
    label: { en: 'Software Engineer', es: 'Software Engineer (en inglés)' },
    role: 'Software Engineer',
    text: `Software Engineer — Platform Team
Harborline Systems (fictional) is hiring a Software Engineer to build and scale our web platform.

What you'll do
- Build and maintain services in TypeScript and Node.js.
- Design REST APIs and GraphQL endpoints backed by PostgreSQL.
- Deploy and operate services on Kubernetes and AWS.
- Improve CI/CD pipelines and automated testing.
- Collaborate with product and design in an agile team.
- Mentor engineers and take part in code review.

Requirements
- 3+ years of professional experience with JavaScript or TypeScript.
- Experience with React and modern front-end tooling.
- Solid understanding of SQL, PostgreSQL and data modeling.
- Familiarity with Docker and Kubernetes.
- Strong system design and performance optimization skills.

Nice to have
- Experience with Kafka or Redis.
- Terraform and infrastructure as code.
- Python scripting.
`,
  },
  productMarketing: {
    id: 'productMarketing',
    lang: 'en',
    label: { en: 'Product Marketing Manager', es: 'Product Marketing Manager (en inglés)' },
    role: 'Product Marketing Manager',
    text: `Product Marketing Manager
Fernwell Analytics (fictional) is looking for a Product Marketing Manager to own positioning and go-to-market for our B2B SaaS platform.

Responsibilities
- Own product positioning and messaging for new features and product launches.
- Plan and run go-to-market campaigns with sales, product and customer success.
- Conduct market research, customer interviews and competitive analysis.
- Build sales enablement materials: battlecards, pitch decks and demos.
- Define buyer personas and measure campaign results with HubSpot and Salesforce.
- Run A/B tests on landing pages and email campaigns to improve conversion.

Requirements
- 4+ years in product marketing for B2B SaaS.
- Proven track record launching products and driving pipeline growth.
- Excellent storytelling, copywriting and cross-functional collaboration.
- Comfortable with marketing analytics and reporting.

Nice to have
- Experience with pricing and packaging.
- SEO and content marketing.
`,
  },
  dataAnalyst: {
    id: 'dataAnalyst',
    lang: 'en',
    label: { en: 'Data Analyst', es: 'Data Analyst (en inglés)' },
    role: 'Data Analyst',
    text: `Data Analyst
Quillbrook Retail Co. (fictional) is hiring a Data Analyst to turn data into decisions.

Responsibilities
- Write SQL queries to extract and analyze data from our data warehouse.
- Build dashboards and reports in Tableau or Power BI for business stakeholders.
- Analyze A/B test results and apply statistics to measure impact.
- Clean and transform data with Python (pandas) and maintain ETL pipelines.
- Present insights and recommendations to stakeholders.

Requirements
- 2+ years of experience in data analysis.
- Advanced SQL and Excel skills.
- Experience with data visualization in Tableau or Power BI.
- Working knowledge of statistics, including regression and hypothesis testing.

Nice to have
- Experience with dbt, Airflow or BigQuery.
- Machine learning fundamentals.
`,
  },
  analistaDatos: {
    id: 'analistaDatos',
    lang: 'es',
    label: { en: 'Analista de Datos (Spanish)', es: 'Analista de Datos' },
    role: 'Analista de datos',
    text: `Analista de Datos
Datanova (empresa ficticia) busca un Analista de Datos para su equipo de inteligencia comercial.

Responsabilidades
- Escribir consultas SQL para extraer y analizar datos del almacén de datos.
- Construir tableros de control en Power BI o Tableau para las áreas comerciales.
- Analizar pruebas A/B y aplicar estadística para medir resultados.
- Limpiar y transformar datos con Python (pandas) y mantener procesos ETL.
- Presentar hallazgos y recomendaciones a las partes interesadas.

Requisitos
- 2 años o más de experiencia en análisis de datos.
- Manejo avanzado de SQL y Excel.
- Experiencia en visualización de datos con Power BI o Tableau.
- Conocimientos de estadística, regresión y pruebas de hipótesis.

Deseable
- Experiencia con dbt, Airflow o BigQuery.
- Nociones de aprendizaje automático.
`,
  },
  gerenteMarca: {
    id: 'gerenteMarca',
    lang: 'es',
    label: { en: 'Gerente de Marca (Spanish)', es: 'Gerente de Marca' },
    role: 'Gerente de marca',
    text: `Gerente de Marca
Alimentos Serrano (empresa ficticia), compañía de consumo masivo, busca un Gerente de Marca para liderar su portafolio de snacks.

Responsabilidades
- Liderar la estrategia de marca y el plan anual de marketing.
- Gestionar el presupuesto de marketing y el P&L de la categoría.
- Coordinar lanzamientos de productos con ventas, finanzas y cadena de suministro.
- Desarrollar campañas integradas junto a las agencias de publicidad y medios.
- Realizar investigación de mercado y análisis de la competencia.
- Medir resultados con KPIs y ROI.

Requisitos
- 5 años o más de experiencia en gestión de marca en consumo masivo.
- Liderazgo de equipos y negociación con agencias.
- Inglés avanzado.

Deseable
- Experiencia en marketing digital y planificación de medios.
`,
  },
};
