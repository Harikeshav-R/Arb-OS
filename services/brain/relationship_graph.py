"""NetworkX-based in-memory relationship graph manager.

Maintains a directed graph of market relationships loaded from the database.
Provides query methods for implication chains, mutual-exclusion groups, and
graph-level statistics.
"""

from __future__ import annotations

import networkx as nx
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import GraphStats, Relationship


class RelationshipGraphManager:
    """Manages an in-memory NetworkX DiGraph of market relationships."""

    def __init__(self) -> None:
        self._graph: nx.DiGraph = nx.DiGraph()

    # ── Loading ───────────────────────────────────────────────────────────────

    async def load_from_db(self, session: AsyncSession) -> None:
        """Load all active relationships from the DB into the graph."""
        result = await session.execute(
            select(Relationship).where(Relationship.is_active.is_(True))
        )
        relationships = result.scalars().all()

        self._graph.clear()
        for rel in relationships:
            self.add_relationship(
                parent_id=rel.parent_condition_id,
                child_id=rel.child_condition_id,
                logic_type=rel.logic_type,
                confidence=rel.confidence,
            )

        logger.info(
            "graph_loaded",
            nodes=self._graph.number_of_nodes(),
            edges=self._graph.number_of_edges(),
        )

    # ── Mutations ─────────────────────────────────────────────────────────────

    def add_relationship(
            self,
            parent_id: str,
            child_id: str,
            logic_type: str,
            confidence: float,
    ) -> None:
        """Add or update an edge in the in-memory graph."""
        self._graph.add_edge(
            parent_id,
            child_id,
            logic_type=logic_type,
            confidence=confidence,
        )

    # ── Queries ───────────────────────────────────────────────────────────────

    def get_implications_for(self, condition_id: str) -> list[dict]:
        """Return all IMPLIES edges involving the given market.

        Returns both directions:
        - outgoing: this market implies another (subset → superset)
        - incoming: another market implies this one
        """
        results: list[dict] = []

        # Outgoing edges (this market is the subset / parent)
        for _, target, data in self._graph.out_edges(condition_id, data=True):
            if data.get("logic_type") == "IMPLIES":
                results.append({
                    "parent_condition_id": condition_id,
                    "child_condition_id": target,
                    "direction": "outgoing",
                    "confidence": data.get("confidence", 0.0),
                })

        # Incoming edges (this market is the superset / child)
        for source, _, data in self._graph.in_edges(condition_id, data=True):
            if data.get("logic_type") == "IMPLIES":
                results.append({
                    "parent_condition_id": source,
                    "child_condition_id": condition_id,
                    "direction": "incoming",
                    "confidence": data.get("confidence", 0.0),
                })

        return results

    def get_partition_groups(self) -> list[list[str]]:
        """Return groups of mutually exclusive markets.

        Builds an undirected subgraph of only ``MUTUALLY_EXCLUSIVE`` edges,
        then returns the connected components as groups.
        """
        me_graph = nx.Graph()
        for u, v, data in self._graph.edges(data=True):
            if data.get("logic_type") == "MUTUALLY_EXCLUSIVE":
                me_graph.add_edge(u, v)

        return [sorted(comp) for comp in nx.connected_components(me_graph)]

    def get_stats(self) -> GraphStats:
        """Return high-level graph statistics."""
        total_implies = sum(
            1
            for _, _, d in self._graph.edges(data=True)
            if d.get("logic_type") == "IMPLIES"
        )
        total_me = sum(
            1
            for _, _, d in self._graph.edges(data=True)
            if d.get("logic_type") == "MUTUALLY_EXCLUSIVE"
        )

        # Connected components on the undirected view
        undirected = self._graph.to_undirected()
        components = nx.number_connected_components(undirected) \
            if undirected.number_of_nodes() > 0 else 0

        return GraphStats(
            total_markets=self._graph.number_of_nodes(),
            total_relationships=self._graph.number_of_edges(),
            total_implies=total_implies,
            total_mutually_exclusive=total_me,
            connected_components=components,
        )

    def get_all_relationships(self) -> list[dict]:
        """Return all edges as dicts."""
        return [
            {
                "parent_condition_id": u,
                "child_condition_id": v,
                "logic_type": data.get("logic_type"),
                "confidence": data.get("confidence", 0.0),
            }
            for u, v, data in self._graph.edges(data=True)
        ]
