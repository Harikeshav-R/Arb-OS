"""Tests for the NetworkX-based RelationshipGraphManager."""

from __future__ import annotations

import pytest

from relationship_graph import RelationshipGraphManager


@pytest.fixture
def graph_mgr():
    return RelationshipGraphManager()


class TestAddRelationship:
    def test_adds_edge(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "IMPLIES", 0.9)

        stats = graph_mgr.get_stats()
        assert stats.total_markets == 2
        assert stats.total_relationships == 1
        assert stats.total_implies == 1

    def test_updates_existing_edge(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "IMPLIES", 0.8)
        graph_mgr.add_relationship("0xa", "0xb", "MUTUALLY_EXCLUSIVE", 0.95)

        stats = graph_mgr.get_stats()
        assert stats.total_relationships == 1
        assert stats.total_implies == 0
        assert stats.total_mutually_exclusive == 1


class TestGetImplicationsFor:
    def test_returns_outgoing(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "IMPLIES", 0.9)

        results = graph_mgr.get_implications_for("0xa")

        assert len(results) == 1
        assert results[0]["direction"] == "outgoing"
        assert results[0]["child_condition_id"] == "0xb"

    def test_returns_incoming(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "IMPLIES", 0.9)

        results = graph_mgr.get_implications_for("0xb")

        assert len(results) == 1
        assert results[0]["direction"] == "incoming"
        assert results[0]["parent_condition_id"] == "0xa"

    def test_ignores_non_implies(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "MUTUALLY_EXCLUSIVE", 0.9)

        results = graph_mgr.get_implications_for("0xa")
        assert len(results) == 0

    def test_unknown_node_returns_empty(self, graph_mgr):
        results = graph_mgr.get_implications_for("0xunknown")
        assert results == []


class TestGetPartitionGroups:
    def test_returns_groups(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "MUTUALLY_EXCLUSIVE", 0.9)
        graph_mgr.add_relationship("0xb", "0xc", "MUTUALLY_EXCLUSIVE", 0.85)

        groups = graph_mgr.get_partition_groups()

        assert len(groups) == 1
        assert set(groups[0]) == {"0xa", "0xb", "0xc"}

    def test_separate_groups(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "MUTUALLY_EXCLUSIVE", 0.9)
        graph_mgr.add_relationship("0xc", "0xd", "MUTUALLY_EXCLUSIVE", 0.8)

        groups = graph_mgr.get_partition_groups()
        assert len(groups) == 2

    def test_no_me_edges(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "IMPLIES", 0.9)

        groups = graph_mgr.get_partition_groups()
        assert groups == []


class TestGetStats:
    def test_empty_graph(self, graph_mgr):
        stats = graph_mgr.get_stats()

        assert stats.total_markets == 0
        assert stats.total_relationships == 0
        assert stats.total_implies == 0
        assert stats.total_mutually_exclusive == 0
        assert stats.connected_components == 0

    def test_mixed_graph(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "IMPLIES", 0.9)
        graph_mgr.add_relationship("0xc", "0xd", "MUTUALLY_EXCLUSIVE", 0.8)
        graph_mgr.add_relationship("0xa", "0xc", "IMPLIES", 0.7)

        stats = graph_mgr.get_stats()

        assert stats.total_markets == 4
        assert stats.total_relationships == 3
        assert stats.total_implies == 2
        assert stats.total_mutually_exclusive == 1
        assert stats.connected_components == 1  # all connected via 0xa-0xc


class TestGetAllRelationships:
    def test_returns_all_edges(self, graph_mgr):
        graph_mgr.add_relationship("0xa", "0xb", "IMPLIES", 0.9)
        graph_mgr.add_relationship("0xc", "0xd", "MUTUALLY_EXCLUSIVE", 0.8)

        rels = graph_mgr.get_all_relationships()

        assert len(rels) == 2
        types = {r["logic_type"] for r in rels}
        assert types == {"IMPLIES", "MUTUALLY_EXCLUSIVE"}
