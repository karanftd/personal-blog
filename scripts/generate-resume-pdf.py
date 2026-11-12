#!/usr/bin/env python3
"""Regenerate public/Karan-Bhalodiya-Resume.pdf from the resume data.

Source of truth for the content is src/pages/resume.astro; this script
mirrors that page's experience / skills / education so the downloadable
PDF does not go stale when the page is updated. Edit the data below
when the page changes, then run: python3 scripts/generate-resume-pdf.py
"""
import re
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                HRFlowable)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "Karan-Bhalodiya-Resume.pdf"

# Keep to WinAnsi-safe characters for Helvetica.
def clean(s: str) -> str:
    return (s.replace("<strong>", "").replace("</strong>", "")
             .replace("\u2192", "->").replace("\u00d7", "x")
             .replace("\u2019", "'").replace("\u201c", '"')
             .replace("\u201d", '"').replace("&", "&amp;"))

EXPERIENCE = [
    {
        "role": "AI Software Engineer",
        "company": "Beamtrail",
        "location": "Abu Dhabi, UAE",
        "period": "Nov 2026 - Present",
        "summary": "AI Software Engineer at Beamtrail in Abu Dhabi.",
        "tech": [],
        "highlights": [],
    },
    {
        "role": "Lead Software Engineer",
        "company": "Pelago by Singapore Airlines",
        "location": "Singapore",
        "period": "Apr 2020 - Sep 2026",
        "summary": ("Led multiple high-performing engineering initiatives across the Pelago "
                    "platform from its inception, encompassing the core transactional system "
                    "(0-to-1 build), global marketplace expansion, and user retention/growth features."),
        "tech": ["Python", "Flask", "Celery", "Redis", "PostgreSQL", "AWS ECS", "Ansible",
                 "CircleCI", "ElasticSearch", "Apollo GraphQL", "Firebase"],
        "highlights": [
            "Led a team of 5 engineers to design and deliver customer retention and growth systems, increasing annual retention from ~1% to 8-10% (10x improvement).",
            "Built revenue-generating growth loops (referrals, gift cards, affiliate APIs), contributing $1M+ GMV in FY 2024-2025.",
            "Architected a distributed communication platform integrating SendGrid, Twilio, and Firebase with retry, idempotency, and failure recovery via Kafka.",
            "Designed event-driven workflows using Celery + Redis to process ~50K+ async jobs/day with ~200ms processing latency.",
            "Led LLM-based feature development (itinerary generation, content automation) - reduced manual content effort by 60%, improved delivery speed by 2x.",
            "Introduced AI-assisted engineering workflows (code review, test generation, security checks), improving team throughput by 35%.",
            "Led integration of multiple global inventory providers (BeMyGuest, GlobalTix, Rezdy, Viator) - enabling expansion to 60+ countries, 3,200+ destinations, and 190K+ products.",
            "Designed and implemented a personalised promotion engine using ML-driven targeting - increased bookings 30x over 6 months, reduced coupon abuse by 30%.",
            "Designed a state-machine-based booking and payment system integrating Stripe and KrisFlyer Miles wallet.",
            "Developed a multi-currency checkout system supporting 12+ currencies for global market expansion.",
        ],
    },
    {
        "role": "Sr. Software Engineer (Engineering Productivity)",
        "company": "DataRobot",
        "location": "Singapore",
        "period": "Mar 2019 - Apr 2020",
        "summary": ("Joined to build an internal developer platform as DataRobot scaled to 500+ "
                    "engineers globally; focused on CI/CD reliability, cost optimisation, and developer tooling."),
        "tech": ["Java", "Spring Boot", "Vue.js", "PostgreSQL", "Redis", "AWS Lambda",
                 "API Gateway", "DynamoDB", "Jenkins"],
        "highlights": [
            "Built an automated code review workflow system on AWS Lambda integrating Jira, GitHub, Jenkins, and Slack - reduced PR review time from 72 hours to under 24 hours.",
            "Reduced AWS expenditure by ~40% through internal productivity tools and automated dev workflows.",
            "Developed a flake detection and quarantine system, slashing infrastructure expenditure by ~$750/day.",
            "Built developer-facing dashboards (Spring Boot + Vue.js) for build health, PR status, and flake visibility.",
        ],
    },
    {
        "role": "Software Engineer",
        "company": "Shopback",
        "location": "Singapore",
        "period": "Apr 2018 - Feb 2019",
        "summary": "Designed & developed microservices-based RESTful APIs using NodeJS and MongoDB for Shopback GO.",
        "tech": ["Node.js", "MongoDB", "AWS ECS", "Docker"],
        "highlights": [
            "Designed microservices-based RESTful APIs for the Shopback GO mobile platform, supporting millions of daily transactions at launch.",
            "Created a reusable shared module library and enforced standards via code reviews - maintaining 94%+ code coverage.",
        ],
    },
    {
        "role": "Solution Engineer",
        "company": "eInfochips (an Arrow Company)",
        "location": "Ahmedabad, India",
        "period": "Oct 2016 - Mar 2018",
        "summary": "",
        "tech": ["Java", "Spring Boot", "MySQL", "Redis", "Jenkins", "React"],
        "highlights": [
            "Introduced Git flow, Docker containerisation, and full CI/CD pipelines, accelerating release velocity by 60%.",
            "Led migration from monolithic architecture to microservices, cutting deployment time by 3x and enabling faster feature releases.",
        ],
    },
    {
        "role": "Software Engineer",
        "company": "Azoi Inc.",
        "location": "Ahmedabad, India",
        "period": "Jun 2012 - Oct 2016",
        "summary": "",
        "tech": ["Python", "Flask", "React", "Celery", "Redis", "PostgreSQL", "Jenkins", "Stripe"],
        "highlights": [
            "Built RESTful APIs (Flask, MongoDB, Celery, Redis) for a real-time health monitoring platform handling sensitive medical data.",
            "Optimised data transmission using Protobuf and gzip compression, reducing response time by ~300ms.",
        ],
    },
]

SKILLS = {
    "Infrastructure": ["AWS", "GCP", "Kubernetes", "NGINX", "Docker", "Kafka", "RabbitMQ", "Heroku", "Jenkins", "Gitlab"],
    "Backend / Frontend": ["Python", "NodeJS", "Java", "ReactJS", "CSS", "HTML"],
    "Protocols": ["REST", "GraphQL", "gRPC"],
    "Datastores": ["PostgreSQL", "MongoDB", "MySQL", "Redis"],
    "AI / ML": ["OpenAI GPT-4o", "Claude (Anthropic)", "Gemini Pro", "Pinecone", "pgvector", "GitHub Copilot", "Cursor"],
    "Certifications": ["AWS Developer Associate"],
}

EDUCATION = [
    ("MCA", "Visvesvaraya Technological University (VTU)", "Bangalore, India", "2009-2012"),
    ("BCA", "Saurashtra University", "Gujarat, India", "2006-2009"),
]

SUMMARY = ("Results-driven Lead Software Engineer with 12+ years of experience, including significant "
           "tenure in high-growth, product-based startups and 0-to-1 platform builds. Proven track record "
           "of architecting scalable distributed systems, driving engineering productivity, and leading "
           "high-performing teams in fast-paced environments. Adept at bridging the gap between complex "
           "technical execution and strategic product goals to deliver user-centric features and millions "
           "in rapid revenue growth.")

S = {
    "name": ParagraphStyle("name", fontName="Helvetica-Bold", fontSize=20, leading=24),
    "contact": ParagraphStyle("contact", fontName="Helvetica", fontSize=9, leading=12, textColor="#444444"),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12, leading=15, spaceBefore=14, spaceAfter=6),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=13.5),
    "job": ParagraphStyle("job", fontName="Helvetica-Bold", fontSize=10.5, leading=13),
    "meta": ParagraphStyle("meta", fontName="Helvetica", fontSize=9.5, leading=12, textColor="#444444"),
    "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.5, leading=13.5, leftIndent=12, bulletIndent=4),
}


def build():
    doc = SimpleDocTemplate(str(OUT), pagesize=A4,
                            topMargin=18 * mm, bottomMargin=18 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm,
                            title="Karan Bhalodiya - Resume",
                            author="Karan Bhalodiya")
    story = []
    story.append(Paragraph("Karan Bhalodiya", S["name"]))
    story.append(Paragraph("Abu Dhabi, UAE | LinkedIn | karan.bhalodiya@gmail.com | +65 87769565", S["contact"]))
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.7))
    story.append(Paragraph("SUMMARY", S["h2"]))
    story.append(Paragraph(clean(SUMMARY), S["body"]))
    story.append(Paragraph("SKILLS", S["h2"]))
    for cat, items in SKILLS.items():
        story.append(Paragraph(f"<b>{clean(cat)}:</b> {clean(', '.join(items))}", S["body"]))
    story.append(Paragraph("WORK EXPERIENCE", S["h2"]))
    for job in EXPERIENCE:
        story.append(Paragraph(clean(f"{job['role']} | {job['company']} | {job['location']} | {job['period']}"), S["job"]))
        if job["summary"]:
            story.append(Paragraph(clean(job["summary"]), S["body"]))
        if job["tech"]:
            story.append(Paragraph(clean("Tech: " + ", ".join(job["tech"])), S["meta"]))
        for h in job["highlights"]:
            story.append(Paragraph(clean(h), S["bullet"], bulletText="\u2022"))
        story.append(Spacer(1, 6))
    story.append(Paragraph("EDUCATION", S["h2"]))
    for degree, school, loc, period in EDUCATION:
        story.append(Paragraph(clean(f"{degree}, {school}, {loc} - {period}"), S["body"]))
    doc.build(story)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
