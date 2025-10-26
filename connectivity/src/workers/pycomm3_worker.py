#!/usr/bin/env python3
"""
PyComm3 Worker - JSON-RPC over stdio

Communicates with Node.js via stdin/stdout using JSON-RPC protocol.
All logs go to stderr to avoid interfering with JSON-RPC on stdout.
"""

import os
import sys
import json
import logging
import asyncio
import threading
import math
from typing import Optional, Dict, Any, List
from datetime import datetime
from pycomm3 import LogixDriver

# Configure logging to stderr only
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


def sanitize_value(value):
    """Convert non-JSON-serializable values (Infinity, NaN) to None"""
    if isinstance(value, float):
        if math.isinf(value) or math.isnan(value):
            return None
    return value


# Array reading mode configuration
# Set PYCOMM3_ARRAY_MODE environment variable to control array reading behavior:
#   'batch' (default) - Read entire arrays using {size} syntax for efficiency
#   'individual' - Read each array element as individual tag (for performance testing)
ARRAY_READ_MODE = os.getenv('PYCOMM3_ARRAY_MODE', 'batch').lower()

# Connection management settings for large tag count scenarios
# These are defaults; actual values are set per-connection via connect() parameters
DEFAULT_MAX_TAGS_PER_GROUP = 500
DEFAULT_MAX_CONCURRENT_CONNECTIONS = 8


class PyComm3Worker:
    """Worker that manages EIP connection via PyComm3"""
    
    def __init__(self):
        self.plc: Optional[LogixDriver] = None
        self.connected = False
        self.host = None
        self.slot = 0
        self.polling = False
        self.poll_tasks: Dict[int, asyncio.Task] = {}  # poll_group_id -> task
        self.poll_groups: Dict[int, Dict[str, Any]] = {}  # poll_group_id -> {rate_ms, tags}
        self.tag_map: Dict[int, Dict[str, Any]] = {}  # tag_id -> {tag_name, data_type, etc}
        self.group_connections: Dict[int, LogixDriver] = {}  # poll_group_id -> dedicated connection
        self.plc_lock = threading.Lock()  # Protect PLC connection from concurrent access
        # Write on change
        self.last_values: Dict[int, Dict[str, Any]] = {}  # tag_id -> {value, timestamp, quality}
        self.tag_configs: Dict[int, Dict[str, Any]] = {}  # tag_id -> {on_change_enabled, on_change_deadband, on_change_deadband_type, on_change_heartbeat_ms}
        # Connection-specific limits (set via connect parameters)
        self.max_tags_per_group = DEFAULT_MAX_TAGS_PER_GROUP
        self.max_concurrent_connections = DEFAULT_MAX_CONCURRENT_CONNECTIONS
        
    def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle JSON-RPC request"""
        method = request.get('method')
        params = request.get('params', {})
        req_id = request.get('id')
        
        try:
            if method == 'connect':
                result = self.connect(params)
            elif method == 'disconnect':
                result = self.disconnect(params)
            elif method == 'read_tag':
                result = self.read_tag(params)
            elif method == 'write_tag':
                result = self.write_tag(params)
            elif method == 'read_tags':
                result = self.read_tags(params)
            elif method == 'list_tags':
                result = self.list_tags(params)
            elif method == 'subscribe_polling':
                result = self.subscribe_polling(params)
            elif method == 'stop_polling':
                result = self.stop_polling(params)
            elif method == 'discover':
                result = self.discover(params)
            elif method == 'list_identity':
                result = self.list_identity(params)
            elif method == 'browse_tags':
                result = self.browse_tags(params)
            elif method == 'resolve_types':
                result = self.resolve_types(params)
            elif method == 'get_connection_status':
                result = self.get_connection_status(params)
            elif method == 'get_rack_configuration':
                result = self.get_rack_configuration(params)
            else:
                return {
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32601,
                        'message': f'Method not found: {method}'
                    },
                    'id': req_id
                }
            
            return {
                'jsonrpc': '2.0',
                'result': result,
                'id': req_id
            }
            
        except Exception as e:
            logger.error(f"Error handling {method}: {e}", exc_info=True)
            return {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32000,
                    'message': str(e)
                },
                'id': req_id
            }
    
    def connect(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Connect to PLC"""
        self.host = params.get('host')
        self.slot = params.get('slot', 0)
        
        # Get connection-specific limits from parameters
        self.max_tags_per_group = params.get('max_tags_per_group', DEFAULT_MAX_TAGS_PER_GROUP)
        self.max_concurrent_connections = params.get('max_concurrent_connections', DEFAULT_MAX_CONCURRENT_CONNECTIONS)
        
        if not self.host:
            raise ValueError('host parameter required')
        
        logger.info(f"Connecting to {self.host} slot {self.slot}")
        logger.info(f"Array read mode: {ARRAY_READ_MODE} (set PYCOMM3_ARRAY_MODE=individual to read arrays as individual tags)")
        logger.info(f"Max tags per group: {self.max_tags_per_group}, Max concurrent connections: {self.max_concurrent_connections}")
        
        try:
            # Create LogixDriver instance
            # Path format: slot/port (e.g., "0/0" for slot 0)
            path = f"{self.slot}/0"
            self.plc = LogixDriver(self.host, route_path=path)
            
            # Open connection
            self.plc.open()
            
            if not self.plc.connected:
                raise ConnectionError(f"Failed to connect to {self.host}")
            
            self.connected = True
            logger.info(f"Connected to {self.host} - PLC: {self.plc.info}")
            
            return {
                'success': True,
                'plc_info': str(self.plc.info) if self.plc.info else 'Unknown'
            }
            
        except Exception as e:
            self.connected = False
            logger.error(f"Connection failed: {e}")
            raise ConnectionError(f"Failed to connect: {e}")
    
    def disconnect(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Disconnect from PLC"""
        logger.info("Disconnecting from PLC")
        
        if self.plc:
            try:
                self.plc.close()
            except Exception as e:
                logger.warning(f"Error during disconnect: {e}")
        
        self.plc = None
        self.connected = False
        
        # Clear value change detection cache on disconnect
        self.last_values.clear()
        
        return {'success': True}
    
    def _read_tags_locked(self, *tag_names):
        """Thread-safe tag reading with lock protection"""
        with self.plc_lock:
            return self.plc.read(*tag_names)
    
    def read_tag(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Read single tag value"""
        if not self.connected or not self.plc:
            raise ConnectionError("Not connected to PLC")
        
        tag_name = params.get('tag_name')
        if not tag_name:
            raise ValueError('tag_name parameter required')
        
        logger.debug(f"Reading tag: {tag_name}")
        
        try:
            result = self.plc.read(tag_name)
            
            if result.error:
                raise RuntimeError(f"Read error: {result.error}")
            
            return {
                'tag_name': tag_name,
                'value': result.value,
                'type': result.type,
                'error': None
            }
            
        except Exception as e:
            logger.error(f"Error reading {tag_name}: {e}")
            return {
                'tag_name': tag_name,
                'value': None,
                'type': None,
                'error': str(e)
            }
    
    def read_tags(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Read multiple tags (batched)"""
        if not self.connected or not self.plc:
            raise ConnectionError("Not connected to PLC")
        
        tag_names = params.get('tag_names', [])
        if not tag_names:
            return {'results': []}
        
        logger.debug(f"Reading {len(tag_names)} tags in batch")
        
        try:
            # PyComm3 automatically batches reads into Multiple Service Packets
            results = self.plc.read(*tag_names)
            
            # Handle single vs multiple results
            if not isinstance(results, list):
                results = [results]
            
            return {
                'results': [
                    {
                        'tag_name': r.tag,
                        'value': r.value,
                        'type': r.type,
                        'error': r.error
                    }
                    for r in results
                ]
            }
            
        except Exception as e:
            logger.error(f"Error reading tags: {e}")
            raise RuntimeError(f"Batch read failed: {e}")
    
    def write_tag(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Write single tag value"""
        if not self.connected or not self.plc:
            raise ConnectionError("Not connected to PLC")
        
        tag_name = params.get('tag_name')
        value = params.get('value')
        
        if not tag_name:
            raise ValueError('tag_name parameter required')
        if value is None:
            raise ValueError('value parameter required')
        
        logger.debug(f"Writing tag: {tag_name} = {value}")
        
        try:
            result = self.plc.write((tag_name, value))
            
            if result.error:
                raise RuntimeError(f"Write error: {result.error}")
            
            return {
                'tag_name': tag_name,
                'success': True,
                'error': None
            }
            
        except Exception as e:
            logger.error(f"Error writing {tag_name}: {e}")
            return {
                'tag_name': tag_name,
                'success': False,
                'error': str(e)
            }
    
    def list_tags(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """List all tags from PLC"""
        if not self.connected or not self.plc:
            raise ConnectionError("Not connected to PLC")
        
        program = params.get('program', None)
        
        logger.info(f"Listing tags (program={program})")
        
        try:
            # Get tag list from PLC
            tags = self.plc.get_tag_list(program=program)
            
            return {
                'tags': [
                    {
                        'tag_name': tag['tag_name'],
                        'data_type': tag.get('data_type', 'UNKNOWN'),
                        'array': tag.get('dim', 0) > 0,
                        'dimensions': tag.get('dim', 0)
                    }
                    for tag in tags
                ]
            }
            
        except Exception as e:
            logger.error(f"Error listing tags: {e}")
            raise RuntimeError(f"Tag list failed: {e}")
    
    def _has_value_changed(self, tag_id: int, new_value: Any, new_quality: int) -> bool:
        """Check if value has changed enough to warrant publishing"""
        import time
        
        config = self.tag_configs.get(tag_id, {})
        if not config.get('on_change_enabled', False):
            return True  # always publish if write on change disabled
        
        last = self.last_values.get(tag_id)
        
        # Always publish on first read
        if not last:
            return True
        
        # Always publish if quality changed
        if last.get('quality') != new_quality:
            return True
        
        # Check force publish interval (heartbeat)
        force_interval = config.get('on_change_heartbeat_ms')
        if force_interval and force_interval > 0:
            elapsed_ms = (time.time() * 1000) - last.get('timestamp', 0)
            if elapsed_ms >= force_interval:
                logger.debug(f"PyComm3 force publish (heartbeat) tag_id={tag_id} elapsed={elapsed_ms}ms")
                return True
        
        # Type-specific comparison
        old_value = last.get('value')
        
        # Null/None handling
        if old_value is None or new_value is None:
            return old_value != new_value
        
        # Numeric with deadband
        if isinstance(new_value, (int, float)) and isinstance(old_value, (int, float)):
            deadband = config.get('on_change_deadband', 0)
            
            if deadband > 0:
                if config.get('on_change_deadband_type') == 'percent':
                    # Percentage-based deadband
                    base = abs(old_value) if old_value != 0 else 1  # avoid division by zero
                    percent_change = abs((new_value - old_value) / base) * 100
                    if percent_change < deadband:
                        logger.debug(f"PyComm3 skipped (percent deadband) tag_id={tag_id} old={old_value} new={new_value} change={percent_change:.2f}%")
                        return False
                else:
                    # Absolute deadband
                    diff = abs(new_value - old_value)
                    if diff < deadband:
                        logger.debug(f"PyComm3 skipped (absolute deadband) tag_id={tag_id} old={old_value} new={new_value} diff={diff}")
                        return False
            else:
                # Exact match required
                if old_value == new_value:
                    logger.debug(f"PyComm3 skipped (exact match) tag_id={tag_id} value={new_value}")
                    return False
            return True
        
        # Boolean, string, or other types - exact comparison
        if old_value == new_value:
            logger.debug(f"PyComm3 skipped (no change) tag_id={tag_id} value={new_value}")
            return False
        
        return True
    
    def _update_last_value(self, tag_id: int, value: Any, quality: int):
        """Update last value cache"""
        import time
        self.last_values[tag_id] = {
            'value': value,
            'quality': quality,
            'timestamp': time.time() * 1000  # milliseconds
        }
    
    def discover(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Network broadcast discovery - finds all CIP devices"""
        from pycomm3 import CIPDriver
        
        broadcast_address = params.get('broadcast_address', '255.255.255.255')
        
        logger.info(f"Starting network discovery on {broadcast_address}")
        logger.info("Discovering devices...")
        
        try:
            # PyComm3 discover returns list of device info dicts
            # Pass broadcast_address to the discover method
            devices = CIPDriver.discover(broadcast_address=broadcast_address)
            
            if not devices:
                logger.info("No Ethernet/IP devices discovered")
            
            result_devices = []
            for device in devices:
                # Handle revision - PyComm3 returns Revision object with major/minor attributes
                if hasattr(device.Revision, 'major') and hasattr(device.Revision, 'minor'):
                    revision_major = device.Revision.major
                    revision_minor = device.Revision.minor
                else:
                    # Fallback if Revision is just an integer
                    revision_major = int(device.Revision) if device.Revision else 0
                    revision_minor = 0
                
                result_devices.append({
                    'ip': device.IPAddress,
                    'vendor': device.Vendor,
                    'product_name': device.ProductName,
                    'product_code': device.ProductCode,
                    'serial': device.SerialNumber,
                    'revision': {
                        'major': revision_major,
                        'minor': revision_minor
                    }
                })
            
            logger.info(f"Found {len(result_devices)} devices")
            return {'devices': result_devices}
            
        except Exception as e:
            logger.error(f"Device discovery failed: {e}")
            raise RuntimeError(f"Discovery failed: {e}")
    
    def list_identity(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get identity of a single device by IP - returns both module and processor info"""
        from pycomm3 import CIPDriver, LogixDriver
        
        ip_address = params.get('ip_address')
        slot = params.get('slot', 0)
        
        if not ip_address:
            raise ValueError("ip_address is required")
        
        logger.info(f"Getting device identity for {ip_address} (slot {slot})")
        
        try:
            # Get Ethernet module info first
            module_info = CIPDriver.list_identity(ip_address)
            
            if not module_info:
                raise RuntimeError(f"No response from device at {ip_address}")
            
            # Try to connect to get processor info (ControlLogix/CompactLogix)
            try:
                with LogixDriver(ip_address, slot=slot) as plc:
                    plc_info = plc.get_plc_info()
                    
                    # Log all available data for debugging
                    logger.info(f"Full PLC info available: {list(plc_info.keys())}")
                    
                    # Log data types for debugging
                    for key, value in plc_info.items():
                        logger.info(f"  {key}: {type(value).__name__} = {repr(value)[:100]}")
                    
                    # Helper function to convert values to JSON-serializable types
                    def make_json_safe(value):
                        """Convert value to JSON-serializable type"""
                        if value is None:
                            return None
                        elif isinstance(value, (str, int, float, bool)):
                            return value
                        elif isinstance(value, bytes):
                            # Decode bytes to string
                            try:
                                return value.decode('utf-8')
                            except:
                                return value.hex()  # Return hex string if decode fails
                        elif isinstance(value, dict):
                            return {k: make_json_safe(v) for k, v in value.items()}
                        elif isinstance(value, (list, tuple)):
                            return [make_json_safe(v) for v in value]
                        elif hasattr(value, '__dict__'):
                            return str(value)
                        else:
                            return str(value)
                    
                    # Handle revision - could be dict or object
                    revision_data = plc_info.get('revision', {'major': 0, 'minor': 0})
                    if isinstance(revision_data, dict):
                        revision = revision_data
                    elif hasattr(revision_data, 'major') and hasattr(revision_data, 'minor'):
                        revision = {'major': revision_data.major, 'minor': revision_data.minor}
                    else:
                        # Revision is a single number
                        revision = {'major': int(revision_data) if revision_data else 0, 'minor': 0}
                    
                    # Return ALL processor info from PyComm3
                    result = {
                        'ip': ip_address,
                        'vendor': make_json_safe(plc_info.get('vendor', 'Unknown')),
                        'product_name': make_json_safe(plc_info.get('product_name', 'Unknown')),
                        'product_code': plc_info.get('product_code', 0),
                        'serial': make_json_safe(plc_info.get('serial', '')),
                        'revision': revision,
                        'keyswitch': make_json_safe(plc_info.get('keyswitch', 'Unknown')),
                        # Include ALL additional fields from get_plc_info()
                        'device_type': make_json_safe(plc_info.get('device_type')),
                        'product_type': plc_info.get('product_type'),
                        'status': make_json_safe(plc_info.get('status')),
                        'name': make_json_safe(plc_info.get('name')),
                        'state': make_json_safe(plc_info.get('state')),
                        'slot': plc_info.get('slot'),
                        # Module info - ensure all fields are JSON-safe
                        'module': {
                            'product_name': make_json_safe(module_info.get('product_name', 'Unknown')),
                            'serial': make_json_safe(module_info.get('serial', '')),
                            'revision': make_json_safe(module_info.get('revision', {'major': 0, 'minor': 0})),
                            'vendor': make_json_safe(module_info.get('vendor')),
                            'product_code': module_info.get('product_code'),
                            'device_type': make_json_safe(module_info.get('device_type')),
                            'product_type': module_info.get('product_type'),
                        }
                    }
                    
                    # Add any other fields that might be in plc_info
                    for key, value in plc_info.items():
                        if key not in result and value is not None:
                            # Convert objects to dicts if possible
                            try:
                                result[f'raw_{key}'] = make_json_safe(value)
                            except:
                                pass
                    
                    logger.info(f"Returning extended device info with {len(result)} fields")
                    return result
            except Exception as e:
                # If processor connection fails, return module info as fallback
                logger.warning(f"Could not get processor info, returning module info: {e}")
                return {
                    'ip': ip_address,
                    'vendor': make_json_safe(module_info.get('vendor', 'Unknown')),
                    'product_name': make_json_safe(module_info.get('product_name', 'Unknown')),
                    'product_code': module_info.get('product_code', 0),
                    'serial': make_json_safe(module_info.get('serial', '')),
                    'revision': make_json_safe(module_info.get('revision', {'major': 0, 'minor': 0})),
                    'note': 'Module info only (processor not accessible)'
                }
            
        except Exception as e:
            logger.error(f"Device identification failed for {ip_address}: {e}")
            raise RuntimeError(f"Identification failed: {e}")
    
    def get_connection_status(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get CIP connection status using Connection Manager Object queries.
        Queries Class 0x06 (Connection Manager), Instance 1:
        - Attribute 5: Max number of CIP connections
        - Attribute 6: Currently open CIP connections
        Falls back to conservative default if device doesn't support queries.
        """
        from pycomm3 import LogixDriver
        
        ip_address = params.get('ip_address')
        slot = params.get('slot', 0)
        dataforeman_count = params.get('dataforeman_count', 1)  # Count from connection tracker
        
        if not ip_address:
            raise ValueError('ip_address parameter required')
        
        logger.info(f"Getting connection status for {ip_address} (slot {slot})")
        
        try:
            # Connect to query device
            with LogixDriver(ip_address, slot=slot) as plc:
                logger.info(f"Connected to {ip_address}, checking if generic_message is available")
                logger.info(f"Driver type: {type(plc).__name__}, has generic_message: {hasattr(plc, 'generic_message')}")
                
                plc_info = plc.get_plc_info()
                product_name = plc_info.get('product_name', 'Unknown')
                product_family = 'Unknown'
                
                # Try to query connection information
                max_connections = None
                current_connections = None
                source = 'device_query'
                query_supported = True
                query_method = None
                
                # Method 1: Try Unconnected Message Manager (Class 0x02B = 306)
                # Works on most Logix5k v16+
                try:
                    logger.info(f"Attempting Unconnected Message Manager query for {ip_address}")
                    logger.info(f"Querying class 0x02B (306), instance 1, attribute 0")
                    
                    resp = plc.generic_message(
                        service=0x0E,       # Get_Attribute_Single
                        class_code=0x02B,   # Unconnected Message Manager (306 decimal)
                        instance=1,
                        attribute=0,        # Free unconnected message buffers
                        request_data=b''
                    )
                    
                    if resp and not resp.error and resp.value:
                        free_buffers = int.from_bytes(resp.value, 'little')
                        logger.info(f"Unconnected Message Manager reports {free_buffers} free buffers")
                        
                        # Total buffers is typically 40 for most Logix controllers
                        total_buffers = 40
                        used_buffers = total_buffers - free_buffers
                        
                        logger.info(f"Estimated connection usage: {used_buffers}/{total_buffers} buffers used")
                        
                        # Use buffer count as connection estimate
                        max_connections = total_buffers
                        current_connections = used_buffers
                        query_method = 'unconnected_message_manager'
                        logger.info(f"Successfully queried via Unconnected Message Manager")
                    else:
                        logger.warning(f"Unconnected Message Manager query returned error or no value")
                        
                except Exception as query_error:
                    logger.warning(f"Unconnected Message Manager query failed: {query_error}")
                
                # Method 2: Fallback to Connection Manager (Class 0x06, Instance 1)
                if max_connections is None or current_connections is None:
                    try:
                        logger.info(f"Attempting Connection Manager query for {ip_address}")
                        # Query Attribute 5: Maximum number of CIP connections
                        logger.debug(f"Querying Connection Manager Attribute 5 (max connections)")
                        max_result = plc.generic_message(
                            service=0x0E,       # Get_Attribute_Single
                            class_code=0x06,    # Connection Manager
                            instance=1,
                            attribute=5,
                            request_data=b''
                        )
                        
                        if max_result and not max_result.error:
                            # Parse result - typically a single UINT (2 bytes)
                            if len(max_result.value) >= 2:
                                max_connections = int.from_bytes(max_result.value[:2], byteorder='little')
                                logger.debug(f"Device reports max connections: {max_connections}")
                        
                        # Query Attribute 6: Currently open CIP connections
                        logger.debug(f"Querying Connection Manager Attribute 6 (current connections)")
                        current_result = plc.generic_message(
                            service=0x0E,       # Get_Attribute_Single
                            class_code=0x06,    # Connection Manager
                            instance=1,
                            attribute=6,
                            request_data=b''
                        )
                        
                        if current_result and not current_result.error:
                            # Parse result - typically a single UINT (2 bytes)
                            if len(current_result.value) >= 2:
                                current_connections = int.from_bytes(current_result.value[:2], byteorder='little')
                                logger.debug(f"Device reports current connections: {current_connections}")
                                query_method = 'connection_manager'
                        
                    except Exception as query_error:
                        logger.warning(f"CIP Connection Manager query failed: {query_error}")
                
                # Check if any query method succeeded
                if max_connections is None or current_connections is None:
                    query_supported = False
                
                # Determine which values to use
                if max_connections is not None and current_connections is not None:
                    # Device query successful - use real-time values
                    source = 'device_query'
                    available = max(0, max_connections - current_connections)
                    usage_percent = int((current_connections / max_connections) * 100) if max_connections > 0 else 0
                    
                    logger.info(f"Device query successful via {query_method}: {current_connections}/{max_connections} connections ({usage_percent}%)")
                else:
                    # No fallback - report that data is unavailable
                    logger.info(f"Device query not available, connection count unavailable")
                    query_supported = False
                    source = 'unavailable'
                    max_connections = None
                    current_connections = None
                    available = None
                    usage_percent = None
                
                result = {
                    'ip': ip_address,
                    'product_name': product_name,
                    'product_family': product_family,
                    'active_connections': current_connections,
                    'max_connections': max_connections,
                    'available_connections': available,
                    'usage_percent': usage_percent,
                    'status': 'unknown' if source == 'unavailable' else ('critical' if usage_percent >= 90 else 'warning' if usage_percent >= 80 else 'healthy'),
                    'source': source,
                    'query_supported': query_supported,
                    'dataforeman_connections': dataforeman_count,
                    'other_connections': max(0, current_connections - dataforeman_count) if (source == 'device_query' and current_connections is not None) else None
                }
                
                if not query_supported:
                    result['message'] = 'Device does not support Connection Manager queries. Connection count unavailable.'
                
                logger.info(f"Connection status: {current_connections}/{max_connections} ({usage_percent}%) - Source: {source}")
                return result
            
        except Exception as e:
            logger.error(f"Connection status query failed: {e}", exc_info=True)
            raise RuntimeError(f"Failed to get connection status: {e}")
    
    def get_rack_configuration(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get full rack configuration for ControlLogix systems - enumerate all modules"""
        from pycomm3 import LogixDriver
        
        ip_address = params.get('ip_address')
        slot = params.get('slot', 0)
        
        if not ip_address:
            raise ValueError('ip_address parameter required')
        
        logger.info(f"Getting rack configuration for {ip_address} (slot {slot})")
        
        try:
            with LogixDriver(ip_address, slot=slot) as plc:
                # Get processor info first
                plc_info = plc.get_plc_info()
                product_name = plc_info.get('product_name', 'Unknown')
                product_family = plc_info.get('product_type', 'Unknown')
                
                # Determine if this is a rack-based system (ControlLogix)
                is_rack = 'ControlLogix' in product_family or product_name.startswith('1756-')
                
                if not is_rack:
                    # For CompactLogix, Micro800, etc. - return single device info
                    return {
                        'type': 'single',
                        'ip': ip_address,
                        'processor': {
                            'slot': slot,
                            'product_name': product_name,
                            'product_type': product_family,
                            'vendor': plc_info.get('vendor', 'Unknown'),
                            'serial': plc_info.get('serial', ''),
                            'revision': plc_info.get('revision', {'major': 0, 'minor': 0}),
                            'keyswitch': plc_info.get('keyswitch', 'Unknown')
                        }
                    }
                
                # ControlLogix - enumerate rack modules
                logger.info(f"Enumerating rack modules for {product_name}")
                modules = []
                
                # Scan typical ControlLogix rack slots (0-16)
                # Slot 0 is usually power supply or reserved
                # Processor is usually in slot found during identification
                for slot_num in range(17):
                    try:
                        module_info = plc.get_module_info(slot_num)
                        if module_info and module_info.get('product_name'):
                            modules.append({
                                'slot': slot_num,
                                'product_name': module_info.get('product_name', 'Unknown'),
                                'product_type': module_info.get('product_type', 'Unknown'),
                                'vendor': module_info.get('vendor', 'Unknown'),
                                'serial': module_info.get('serial', ''),
                                'revision': module_info.get('revision', {'major': 0, 'minor': 0}),
                                'product_code': module_info.get('product_code', 0)
                            })
                            logger.info(f"  Slot {slot_num}: {module_info.get('product_name')}")
                    except Exception as e:
                        # Slot empty or not accessible - this is normal
                        continue
                
                logger.info(f"Found {len(modules)} modules in rack")
                
                return {
                    'type': 'rack',
                    'ip': ip_address,
                    'processor_slot': slot,
                    'processor': {
                        'slot': slot,
                        'product_name': product_name,
                        'product_type': product_family,
                        'vendor': plc_info.get('vendor', 'Unknown'),
                        'serial': plc_info.get('serial', ''),
                        'revision': plc_info.get('revision', {'major': 0, 'minor': 0}),
                        'keyswitch': plc_info.get('keyswitch', 'Unknown')
                    },
                    'modules': modules,
                    'module_count': len(modules)
                }
                
        except Exception as e:
            logger.error(f"Rack configuration query failed: {e}", exc_info=True)
            raise RuntimeError(f"Failed to get rack configuration: {e}")
    
    def subscribe_polling(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Start multi-rate polling with tag subscriptions"""
        if not self.connected or not self.plc:
            raise ConnectionError("Not connected to PLC")
        
        tags = params.get('tags', [])
        poll_groups = params.get('poll_groups', {})
        
        logger.info(f"Subscribing to polling: {len(tags)} tags, {len(poll_groups)} poll groups")
        
        # Warn about large tag counts that may trigger PyComm3 issues
        if len(tags) > 1500:
            logger.warning(f"Large tag count detected ({len(tags)} tags). This may trigger PyComm3 forward_close errors. Consider splitting into smaller subscriptions.")
        
        # Stop existing polling with enhanced error handling
        self.stop_polling({})
        
        # Clear existing data
        self.tag_map.clear()
        self.poll_groups.clear()
        
        # Build tag map and configurations
        for tag in tags:
            tag_id = tag['tag_id']
            self.tag_map[tag_id] = {
                'tag_id': tag_id,
                'tag_name': tag['tag_name'],
                'data_type': tag.get('data_type', 'UNKNOWN'),
                'poll_group_id': tag['poll_group_id'],
                'array_size': tag.get('array_size', 1)
            }
            
            # Update tag configuration for write on change
            self.tag_configs[tag_id] = {
                'on_change_enabled': tag.get('on_change_enabled', False),
                'on_change_deadband': tag.get('on_change_deadband', 0),
                'on_change_deadband_type': tag.get('on_change_deadband_type', 'absolute'),
                'on_change_heartbeat_ms': tag.get('on_change_heartbeat_ms', 60000)
            }
        
        # Build poll groups and automatically split large groups
        group_warnings = []
        next_group_id = max([int(gid) for gid in poll_groups.keys()]) + 1 if poll_groups else 1
        
        for group_id_str, group_info in poll_groups.items():
            group_id = int(group_id_str)
            rate_ms = group_info['rate_ms']
            tag_ids = group_info['tag_ids']
            
            # Automatically split large poll groups to avoid PyComm3 issues
            if len(tag_ids) > self.max_tags_per_group:
                logger.warning(f"Poll group {group_id} has {len(tag_ids)} tags (exceeds limit of {self.max_tags_per_group}). Automatically splitting into smaller groups.")
                
                # Split tags into chunks
                tag_chunks = [tag_ids[i:i + self.max_tags_per_group] for i in range(0, len(tag_ids), self.max_tags_per_group)]
                
                # Create separate poll groups for each chunk
                for i, chunk in enumerate(tag_chunks):
                    chunk_group_id = group_id if i == 0 else next_group_id
                    if i > 0:
                        next_group_id += 1
                    
                    logger.info(f"Creating poll group {chunk_group_id} with {len(chunk)} tags (chunk {i+1}/{len(tag_chunks)}) at {rate_ms}ms")
                    
                    self.poll_groups[chunk_group_id] = {
                        'rate_ms': rate_ms,
                        'tag_ids': chunk,
                        'tags': [self.tag_map[tid] for tid in chunk if tid in self.tag_map],
                        'last_poll': 0,
                        'task': None
                    }
            else:
                # Group is small enough, use as-is
                logger.info(f"Creating poll group {group_id} with {len(tag_ids)} tags at {rate_ms}ms")
                
                self.poll_groups[group_id] = {
                    'rate_ms': rate_ms,
                    'tag_ids': tag_ids,
                    'tags': [self.tag_map[tid] for tid in tag_ids if tid in self.tag_map],
                    'last_poll': 0,
                    'task': None
                }
        
        # Check total connection count
        if len(self.poll_groups) > self.max_concurrent_connections:
            warning = f"Creating {len(self.poll_groups)} connections (exceeds recommended limit of {self.max_concurrent_connections}). Consider consolidating poll groups."
            group_warnings.append(warning)
            logger.warning(warning)
        
        # Start polling (async tasks will be created in main loop)
        self.polling = True
        
        logger.info(f"Polling subscription complete: {len(self.tag_map)} tags in {len(self.poll_groups)} groups")
        if group_warnings:
            logger.warning(f"Configuration warnings: {'; '.join(group_warnings)}")
        
        result = {
            'success': True,
            'tag_count': len(self.tag_map),
            'group_count': len(self.poll_groups)
        }
        
        # Include warnings in response for frontend display
        if group_warnings:
            result['warnings'] = group_warnings
        
        return result
    
    def stop_polling(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Stop all polling tasks"""
        logger.info("Stopping polling tasks")
        
        self.polling = False
        
        # Cancel all poll tasks
        for group_id, task in self.poll_tasks.items():
            if not task.done():
                task.cancel()
                logger.debug(f"Cancelled poll task for group {group_id}")
        
        self.poll_tasks.clear()
        
        # Close all group connections with enhanced error handling
        for group_id, group_plc in self.group_connections.items():
            try:
                group_plc.close()
                logger.debug(f"Closed connection for poll group {group_id}")
            except Exception as e:
                # Enhanced error handling for PyComm3 forward_close issues
                # This is a known issue when dealing with large tag counts (2000+)
                if "forward_close" in str(e).lower() or "failed to parse reply" in str(e).lower():
                    logger.warning(f"PyComm3 forward_close error for group {group_id} (known issue with large tag counts): {e}")
                    # Force cleanup of the connection object to prevent resource leaks
                    try:
                        if hasattr(group_plc, '_target_cid'):
                            group_plc._target_cid = None
                        if hasattr(group_plc, '_session'):
                            group_plc._session = None
                    except:
                        pass
                else:
                    logger.warning(f"Error closing connection for group {group_id}: {e}")
        
        self.group_connections.clear()
        
        return {'success': True}
    
    def discover(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Network device discovery - broadcast scan for all CIP devices"""
        from pycomm3 import CIPDriver
        
        broadcast_address = params.get('broadcast_address', '255.255.255.255')
        logger.info(f"Starting network discovery on {broadcast_address}")
        
        try:
            # Use CIPDriver.discover() for network scan
            devices = CIPDriver.discover()
            
            # Format results
            device_list = []
            for device in devices:
                device_info = {
                    'ip': device.get('ip_address', 'unknown'),
                    'vendor': device.get('vendor', 'unknown'),
                    'product_name': device.get('product_name', 'unknown'),
                    'product_code': device.get('product_code', 0),
                    'serial': device.get('serial', 'unknown'),
                    'revision': {
                        'major': device.get('revision_major', 0),
                        'minor': device.get('revision_minor', 0)
                    }
                }
                device_list.append(device_info)
            
            logger.info(f"Found {len(device_list)} devices")
            return {'devices': device_list}
            
        except Exception as e:
            logger.error(f"Discovery failed: {e}", exc_info=True)
            raise RuntimeError(f"Device discovery failed: {e}")
    
    def browse_tags(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Browse controller tags with full metadata - connects independently"""
        from pycomm3 import LogixDriver
        
        ip_address = params.get('ip_address')
        slot = params.get('slot', 0)
        program = params.get('program')  # None=controller scope, '*'=all programs, 'ProgramName'=specific
        
        if not ip_address:
            raise ValueError('ip_address parameter required')
        
        logger.info(f"Browsing tags from {ip_address} (slot {slot}) - program filter: {program}")
        
        try:
            # Connect and get tag list
            with LogixDriver(ip_address, slot=slot) as plc:
                # PyComm3 get_tag_list() returns list of dicts with metadata
                tags = plc.get_tag_list(program=program)
                
                # Organize tags by program
                programs = set()
                tag_list = []
                
                for tag in tags:
                    # Get data type name - always use data_type_name which is a simple string
                    data_type_name = tag.get('data_type_name', 'UNKNOWN')
                    
                    # Extract structure members if this is a struct
                    members = []
                    if tag.get('tag_type') == 'struct':
                        data_type_obj = tag.get('data_type')
                        if isinstance(data_type_obj, dict):
                            internal_tags = data_type_obj.get('internal_tags', {})
                            # Convert internal_tags dict to array of member info
                            for member_name, member_info in internal_tags.items():
                                if isinstance(member_info, dict):
                                    members.append({
                                        'name': member_name,
                                        'data_type': member_info.get('data_type_name', member_info.get('data_type', 'UNKNOWN')),
                                        'tag_type': member_info.get('tag_type', 'atomic'),
                                        'offset': member_info.get('offset', 0),
                                        'bit': member_info.get('bit')  # For BOOL members in structs
                                    })
                    
                    # Extract program name from tag_name if present
                    # PyComm3 returns tags like "Program:MainProgram.Tran_000" for program-scoped tags
                    # Controller-scoped tags have no "Program:" prefix
                    tag_name = tag.get('tag_name', '')
                    program_name = None
                    if tag_name.startswith('Program:'):
                        # Extract program name between "Program:" and first "."
                        parts = tag_name.split('.', 1)
                        if parts:
                            program_name = parts[0].replace('Program:', '')
                    
                    # For the data_type field, use data_type_name for simplicity
                    # The raw data_type from PyComm3 can be complex objects that aren't JSON serializable
                    tag_info = {
                        'tag_name': tag_name,
                        'tag_path': tag_name,  # Same as tag_name for now
                        'data_type': data_type_name,  # Use simple string type name
                        'data_type_name': data_type_name,
                        'tag_type': tag.get('tag_type', 'atomic'),  # 'atomic' or 'struct'
                        'dimensions': tag.get('dimensions', [0, 0, 0]),
                        'external_access': tag.get('external_access', 'Read/Write'),
                        'program': program_name,  # Extracted from tag_name prefix
                        'alias': tag.get('alias', False),
                        'instance_id': tag.get('instance_id'),  # v21+ controllers
                        'members': members  # Structure members (empty for atomic types)
                    }
                    
                    # Track programs
                    if tag_info['program']:
                        programs.add(tag_info['program'])
                    
                    tag_list.append(tag_info)
                
                logger.info(f"Found {len(tag_list)} tags across {len(programs)} programs")
                
                return {
                    'tags': tag_list,
                    'programs': sorted(list(programs)),
                    'modules': []  # Could query module info separately if needed
                }
            
        except Exception as e:
            logger.error(f"Tag browsing failed: {e}", exc_info=True)
            raise RuntimeError(f"Failed to browse tags: {e}")
    
    def resolve_types(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve data types for specific tag names - connects independently"""
        from pycomm3 import LogixDriver
        
        ip_address = params.get('ip_address')
        slot = params.get('slot', 0)
        tag_names = params.get('tag_names', [])
        
        if not ip_address:
            raise ValueError('ip_address parameter required')
        
        if not isinstance(tag_names, list) or len(tag_names) == 0:
            return {'types': {}}
        
        logger.info(f"Resolving types for {len(tag_names)} tags from {ip_address} (slot {slot})")
        
        try:
            # Connect and get tag list to find the requested tags
            with LogixDriver(ip_address, slot=slot) as plc:
                # Get all tags - we need this to find the types
                all_tags = plc.get_tag_list()
                
                # Create a mapping of tag names to their data types
                tag_type_map = {}
                for tag in all_tags:
                    tag_name = tag.get('tag_name', '')
                    data_type_name = tag.get('data_type_name', 'UNKNOWN')
                    tag_type_map[tag_name] = data_type_name
                
                # Resolve types for the requested tag names
                resolved_types = {}
                for tag_name in tag_names:
                    if tag_name in tag_type_map:
                        resolved_types[tag_name] = tag_type_map[tag_name]
                    else:
                        # For array elements like ARR_DINT[100], try to find the base array
                        if '[' in tag_name and ']' in tag_name:
                            base_name = tag_name[:tag_name.index('[')]
                            if base_name in tag_type_map:
                                resolved_types[tag_name] = tag_type_map[base_name]
                            else:
                                resolved_types[tag_name] = 'UNKNOWN'
                        else:
                            resolved_types[tag_name] = 'UNKNOWN'
                
                logger.info(f"Resolved types for {len(resolved_types)} tags")
                
                return {
                    'types': resolved_types
                }
            
        except Exception as e:
            logger.error(f"Type resolution failed: {e}", exc_info=True)
            raise RuntimeError(f"Failed to resolve tag types: {e}")
    
    async def poll_group(self, group_id: int):
        """Poll a group of tags at specified rate"""
        if group_id not in self.poll_groups:
            logger.warning(f"Poll group {group_id} not found")
            return
        
        group = self.poll_groups[group_id]
        rate_ms = group['rate_ms']
        tag_ids = group['tag_ids']
        rate_sec = rate_ms / 1000.0
        
        logger.info(f"Starting poll group {group_id}: {len(tag_ids)} tags at {rate_ms}ms")
        sys.stderr.write(f"[DEBUG] Poll group {group_id} starting with {len(tag_ids)} tags\n")
        sys.stderr.flush()
        
        # Get event loop for executor
        loop = asyncio.get_event_loop()
        
        # Create dedicated connection for this poll group (avoids lock contention)
        # Enhanced connection creation with retry logic for large tag count scenarios
        max_retries = 3
        retry_delay = 1.0  # seconds
        
        for attempt in range(max_retries):
            try:
                if group_id not in self.group_connections:
                    logger.info(f"Creating dedicated connection for poll group {group_id} (attempt {attempt + 1})")
                    path = f"{self.slot}/0"
                    group_plc = LogixDriver(self.host, route_path=path)
                    
                    # Add small delay between connection attempts to avoid overwhelming PLC
                    if attempt > 0:
                        await asyncio.sleep(retry_delay * attempt)
                    
                    group_plc.open()
                    if not group_plc.connected:
                        raise ConnectionError(f"Failed to connect for group {group_id}")
                    self.group_connections[group_id] = group_plc
                    logger.info(f"Poll group {group_id} connection established")
                    break
                
            except Exception as e:
                logger.warning(f"Connection attempt {attempt + 1} failed for poll group {group_id}: {e}")
                if attempt == max_retries - 1:
                    logger.error(f"Failed to create connection for poll group {group_id} after {max_retries} attempts")
                    return
                # Clean up partial connection state before retry
                if group_id in self.group_connections:
                    try:
                        self.group_connections[group_id].close()
                    except:
                        pass
                    del self.group_connections[group_id]
        
        group_plc = self.group_connections[group_id]
        
        # Drift correction
        next_poll = loop.time() + rate_sec
        
        while self.polling:
            try:
                poll_start = loop.time()
                
                # Group tags by array base name for efficient batch reading
                # Individual tags: {'DINT1': tag_id_6052}
                # Array elements: {'ARR_DINT': {0: tag_id_6053, 1: tag_id_6054, ...}}
                individual_tags = {}  # tag_name -> tag_id
                array_tags = {}  # array_base -> {index: tag_id}
                
                for tag_id in tag_ids:
                    if tag_id not in self.tag_map:
                        continue
                    
                    tag_info = self.tag_map[tag_id]
                    tag_name = tag_info['tag_name']
                    
                    # Check if this is an array element (e.g., ARR_DINT[123])
                    if '[' in tag_name and ']' in tag_name:
                        # Parse array name and index
                        base_name = tag_name[:tag_name.index('[')]
                        index_str = tag_name[tag_name.index('[')+1:tag_name.index(']')]
                        try:
                            index = int(index_str)
                            if base_name not in array_tags:
                                array_tags[base_name] = {}
                            array_tags[base_name][index] = tag_id
                        except ValueError:
                            # Not a numeric index, treat as individual tag
                            individual_tags[tag_name] = tag_id
                    else:
                        individual_tags[tag_name] = tag_id
                
                if not individual_tags and not array_tags:
                    logger.debug(f"Group {group_id} has no tags, sleeping")
                    await asyncio.sleep(rate_sec)
                    continue
                
                # Build read list: individual tags + array reads
                read_requests = []
                tag_name_to_id = {}  # For individual tags
                array_base_to_info = {}  # For array tags
                
                # Add individual tags
                for tag_name, tag_id in individual_tags.items():
                    read_requests.append(tag_name)
                    tag_name_to_id[tag_name] = tag_id
                
                # Add array reads - mode controlled by PYCOMM3_ARRAY_MODE env var
                for array_base, index_map in array_tags.items():
                    # Determine array size (max index + 1)
                    max_index = max(index_map.keys())
                    array_size = max_index + 1
                    num_requested = len(index_map)
                    
                    logger.debug(f"Array {array_base}: mode={ARRAY_READ_MODE}, {num_requested} elements requested, max_index={max_index}")
                    
                    # Check array read mode
                    if ARRAY_READ_MODE == 'individual':
                        # INDIVIDUAL MODE: Always read each array element as separate tag
                        # Used for performance testing and comparison with other drivers
                        logger.debug(f"Array mode=individual: Reading {num_requested} elements of {array_base} individually")
                        for index, tag_id in index_map.items():
                            element_tag = f"{array_base}[{index}]"
                            read_requests.append(element_tag)
                            tag_name_to_id[element_tag] = tag_id
                    else:
                        # BATCH MODE (default): Intelligent array reading
                        # Decide: read entire array or individual elements?
                        # Array reads are more efficient due to:
                        # - Single CIP request vs multiple requests
                        # - Less network overhead
                        # - PLC optimized for contiguous memory reads
                        # Only read individual elements if we need very few (< ~10-20%)
                        
                        # If we need more than 10 elements OR more than 10% of the array, read the whole array
                        if num_requested >= 10 or num_requested >= (array_size * 0.1):
                            # Read entire array - more efficient
                            array_read_tag = f"{array_base}{{{array_size}}}"
                            read_requests.append(array_read_tag)
                            array_base_to_info[array_base] = {
                                'index_map': index_map,
                                'array_size': array_size
                            }
                            logger.debug(f"Array mode=batch: Reading {array_base} as full array ({array_size} elements)")
                        else:
                            # Read individual elements - only if we need very few sparse elements
                            logger.debug(f"Array mode=batch: Reading {num_requested} elements of {array_base} individually (sparse)")
                            for index, tag_id in index_map.items():
                                element_tag = f"{array_base}[{index}]"
                                read_requests.append(element_tag)
                                tag_name_to_id[element_tag] = tag_id
                
                # Read all tags in batch - run in executor to not block event loop
                timestamp = datetime.utcnow().isoformat() + 'Z'
                read_start = loop.time()
                
                # Count actual array reads (full arrays vs individual elements)
                num_full_array_reads = len(array_base_to_info)  # Arrays read as {size}
                num_individual_tag_reads = len(tag_name_to_id)  # Individual tags including array elements read as [index]
                
                # Each poll group has its own connection, so no lock needed
                results = await loop.run_in_executor(None, group_plc.read, *read_requests)
                
                read_duration = (loop.time() - read_start) * 1000  # Convert to ms
                logger.debug(f"Group {group_id}: Read {len(read_requests)} items ({num_individual_tag_reads} individual tags + {num_full_array_reads} full arrays) in {read_duration:.1f}ms (target: {rate_ms}ms)")
                
                # Handle single vs multiple results
                if not isinstance(results, list):
                    results = [results]
                
                # Emit telemetry for each result
                for result in results:
                    result_tag = result.tag
                    
                    # Check if this is an array read result
                    # PyComm3 strips the {size} part, so check if result_tag is in array_base_to_info
                    if result_tag in array_base_to_info:
                        # Array result: ARR_DINT (came from ARR_DINT{1000})
                        array_base = result_tag
                        
                        if result.error:
                            # Error reading array - emit bad quality for all elements
                            if array_base in array_base_to_info:
                                for index, tag_id in array_base_to_info[array_base]['index_map'].items():
                                    telemetry = {
                                        'tag_id': tag_id,
                                        'v': None,
                                        'q': 1,  # Bad quality
                                        'ts': timestamp
                                    }
                                    print(json.dumps(telemetry), flush=True)
                        else:
                            # Success - array value is a list of values
                            array_values = result.value
                            if array_base in array_base_to_info:
                                for index, tag_id in array_base_to_info[array_base]['index_map'].items():
                                    # Get value at this index
                                    if index < len(array_values):
                                        value = sanitize_value(array_values[index])
                                    else:
                                        value = None
                                    
                                    q = 0  # Good quality
                                    
                                    # Check if value changed
                                    if self._has_value_changed(tag_id, value, q):
                                        telemetry = {
                                            'tag_id': tag_id,
                                            'v': value,
                                            'q': q,
                                            'ts': timestamp
                                        }
                                        print(json.dumps(telemetry), flush=True)
                                        self._update_last_value(tag_id, value, q)
                    else:
                        # Individual tag result
                        tag_id = tag_name_to_id.get(result_tag)
                        
                        if tag_id is None:
                            continue
                        
                        # Determine value and quality
                        if result.error:
                            value = None
                            q = 1  # Bad quality
                        else:
                            value = sanitize_value(result.value)
                            q = 0  # Good quality
                        
                        # Check if value changed
                        if self._has_value_changed(tag_id, value, q):
                            telemetry = {
                                'tag_id': tag_id,
                                'v': value,
                                'q': q,
                                'ts': timestamp
                            }
                            print(json.dumps(telemetry), flush=True)
                            self._update_last_value(tag_id, value, q)
                
                # Drift correction: calculate next poll time
                poll_duration = loop.time() - poll_start
                next_poll += rate_sec
                
                # If we're falling behind, catch up
                now = loop.time()
                if next_poll < now:
                    next_poll = now + rate_sec
                
                # Sleep until next poll
                sleep_time = max(0, next_poll - loop.time())
                await asyncio.sleep(sleep_time)
                
            except asyncio.CancelledError:
                logger.info(f"Poll group {group_id} cancelled")
                break
            except Exception as e:
                error_msg = str(e)
                # Enhanced error handling for common PyComm3 issues
                if "forward_close" in error_msg.lower() or "failed to parse reply" in error_msg.lower():
                    logger.warning(f"PyComm3 connection error in poll group {group_id} (attempting recovery): {e}")
                    # Try to recover the connection
                    try:
                        if group_id in self.group_connections:
                            old_connection = self.group_connections[group_id]
                            try:
                                old_connection.close()
                            except:
                                pass  # Ignore close errors
                            del self.group_connections[group_id]
                        
                        # Recreate connection after brief delay
                        await asyncio.sleep(2.0)
                        if self.polling:  # Only recreate if still polling
                            logger.info(f"Recreating connection for poll group {group_id}")
                            path = f"{self.slot}/0"
                            group_plc = LogixDriver(self.host, route_path=path)
                            group_plc.open()
                            if group_plc.connected:
                                self.group_connections[group_id] = group_plc
                                logger.info(f"Successfully recovered connection for poll group {group_id}")
                            else:
                                logger.error(f"Failed to recover connection for poll group {group_id}")
                                break  # Exit this poll group
                    except Exception as recovery_error:
                        logger.error(f"Connection recovery failed for poll group {group_id}: {recovery_error}")
                        break  # Exit this poll group
                else:
                    logger.error(f"Error in poll group {group_id}: {e}", exc_info=True)
                
                await asyncio.sleep(rate_sec)  # Back off on error
        
        logger.info(f"Poll group {group_id} stopped")


def main():
    """Main loop - read JSON-RPC requests from stdin"""
    worker = PyComm3Worker()
    logger.info("PyComm3 worker started, waiting for requests...")
    
    async def async_main():
        """Async main loop"""
        loop = asyncio.get_event_loop()
        
        # Async stdin reader that doesn't block the event loop
        async def read_stdin_async():
            # Run stdin reading in thread pool to not block event loop
            while True:
                try:
                    # Read line from stdin in executor
                    line = await loop.run_in_executor(None, sys.stdin.readline)
                    if not line:  # EOF
                        break
                    
                    line = line.strip()
                    if not line:
                        continue
                    
                    try:
                        request = json.loads(line)
                        
                        # Handle polling subscription specially (needs to start async tasks)
                        if request.get('method') == 'subscribe_polling':
                            response = worker.handle_request(request)
                            print(json.dumps(response), flush=True)
                            
                            # Start polling tasks if subscription was successful
                            if response.get('result', {}).get('success'):
                                for group_id in worker.poll_groups.keys():
                                    if group_id in worker.poll_tasks:
                                        worker.poll_tasks[group_id].cancel()
                                    
                                    task = loop.create_task(worker.poll_group(group_id))
                                    worker.poll_tasks[group_id] = task
                                    logger.info(f"Created poll task for group {group_id}")
                        else:
                            response = worker.handle_request(request)
                            print(json.dumps(response), flush=True)
                        
                    except json.JSONDecodeError as e:
                        logger.error(f"Invalid JSON: {e}")
                        error_response = {
                            'jsonrpc': '2.0',
                            'error': {
                                'code': -32700,
                                'message': 'Parse error: Invalid JSON'
                            },
                            'id': None
                        }
                        print(json.dumps(error_response), flush=True)
                except Exception as e:
                    logger.error(f"Error reading stdin: {e}")
                    break
        
        # Start stdin reader as async task
        await read_stdin_async()
    
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        # Cleanup
        worker.stop_polling({})
        if worker.connected:
            worker.disconnect({})
        logger.info("PyComm3 worker stopped")


if __name__ == '__main__':
    main()
